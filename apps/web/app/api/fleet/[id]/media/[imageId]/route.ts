import {
  NextRequest,
  NextResponse,
} from "next/server";

import { isAuthenticationRequiredError } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import {
  getCurrentWorkspace,
  isWorkspaceAccessError,
} from "@/lib/workspace/get-current-workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET_NAME =
  "yacht-media";

const IMAGE_CATEGORIES =
  new Set([
    "exterior",
    "interior",
    "saloon",
    "master_cabin",
    "guest_cabin",
    "dining",
    "sundeck",
    "beach_club",
    "water_toys",
    "tender",
    "layout",
    "other",
  ]);

type RouteContext = {
  params: Promise<{
    id: string;
    imageId: string;
  }>;
};

type YachtImageRow = {
  id: string;
  storage_path: string;
  image_url: string;
  category: string;
  is_hero: boolean;
  position: number;
  alt_text: string | null;
};

export async function PATCH(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const {
      id: yachtId,
      imageId,
    } =
      await context.params;

    const workspace =
      await getCurrentWorkspace();

    const supabase =
      await createClient();

    const {
      data: imageData,
      error: imageError,
    } =
      await supabase
        .from(
          "yacht_images"
        )
        .select(
          [
            "id",
            "storage_path",
            "image_url",
            "category",
            "is_hero",
            "position",
            "alt_text",
          ].join(",")
        )
        .eq(
          "company_id",
          workspace.companyId
        )
        .eq(
          "fleet_id",
          yachtId
        )
        .eq("id", imageId)
        .maybeSingle();

    if (
      imageError ||
      !imageData
    ) {
      return errorResponse(
        "Yacht image not found.",
        404
      );
    }

    const image =
      imageData as unknown as YachtImageRow;

    const body =
      (await request.json()) as {
        category?: unknown;
        altText?: unknown;
        position?: unknown;
        isHero?: unknown;
      };

    const update: Record<
      string,
      unknown
    > = {};

    if (
      Object.prototype.hasOwnProperty.call(
        body,
        "category"
      )
    ) {
      const category =
        cleanText(
          body.category
        );

      if (
        !category ||
        !IMAGE_CATEGORIES.has(
          category
        )
      ) {
        return errorResponse(
          "Invalid image category.",
          400
        );
      }

      update.category =
        category;
    }

    if (
      Object.prototype.hasOwnProperty.call(
        body,
        "altText"
      )
    ) {
      update.alt_text =
        cleanText(
          body.altText
        );
    }

    if (
      Object.prototype.hasOwnProperty.call(
        body,
        "position"
      )
    ) {
      const position =
        Number(
          body.position
        );

      if (
        !Number.isInteger(
          position
        ) ||
        position < 1
      ) {
        return errorResponse(
          "Image position must be a whole number greater than zero.",
          400
        );
      }

      update.position =
        position;
    }

    if (
      Object.prototype.hasOwnProperty.call(
        body,
        "isHero"
      )
    ) {
      if (
        typeof body.isHero !==
        "boolean"
      ) {
        return errorResponse(
          "isHero must be true or false.",
          400
        );
      }

      if (
        body.isHero
      ) {
        const {
          error:
            clearHeroError,
        } =
          await supabase
            .from(
              "yacht_images"
            )
            .update({
              is_hero:
                false,
            })
            .eq(
              "company_id",
              workspace.companyId
            )
            .eq(
              "fleet_id",
              yachtId
            )
            .eq(
              "is_hero",
              true
            );

        if (
          clearHeroError
        ) {
          throw new Error(
            `Could not change hero image: ${clearHeroError.message}`
          );
        }

        update.is_hero =
          true;
      } else {
        update.is_hero =
          false;
      }
    }

    if (
      Object.keys(
        update
      ).length === 0
    ) {
      return errorResponse(
        "No image changes were provided.",
        400
      );
    }

    const {
      data: updatedData,
      error:
        updateError,
    } =
      await supabase
        .from(
          "yacht_images"
        )
        .update(update)
        .eq(
          "company_id",
          workspace.companyId
        )
        .eq(
          "fleet_id",
          yachtId
        )
        .eq(
          "id",
          imageId
        )
        .select(
          [
            "id",
            "storage_path",
            "image_url",
            "category",
            "is_hero",
            "position",
            "alt_text",
          ].join(",")
        )
        .single();

    if (
      updateError ||
      !updatedData
    ) {
      throw new Error(
        `Could not update yacht image: ${
          updateError?.message ??
          "Unknown database error."
        }`
      );
    }

    const updated =
      updatedData as unknown as YachtImageRow;

    if (
      Object.prototype.hasOwnProperty.call(
        body,
        "isHero"
      )
    ) {
      const heroUrl =
        updated.is_hero
          ? updated.image_url
          : image.is_hero
            ? null
            : undefined;

      if (
        heroUrl !==
        undefined
      ) {
        const {
          error:
            fleetUpdateError,
        } =
          await supabase
            .from("fleet")
            .update({
              hero_image_url:
                heroUrl,
              profile_updated_at:
                new Date().toISOString(),
            })
            .eq(
              "company_id",
              workspace.companyId
            )
            .eq(
              "id",
              yachtId
            );

        if (
          fleetUpdateError
        ) {
          throw new Error(
            `Image updated, but the yacht hero could not be synchronized: ${fleetUpdateError.message}`
          );
        }
      }
    }

    return NextResponse.json(
      {
        success: true,
        image: serializeImage(
          updated
        ),
      },
      { status: 200 }
    );
  } catch (error) {
    return handleRouteError(
      error,
      "Could not update yacht image."
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  context: RouteContext
) {
  try {
    const {
      id: yachtId,
      imageId,
    } =
      await context.params;

    const workspace =
      await getCurrentWorkspace();

    const supabase =
      await createClient();

    const {
      data: imageData,
      error: imageError,
    } =
      await supabase
        .from(
          "yacht_images"
        )
        .select(
          [
            "id",
            "storage_path",
            "image_url",
            "category",
            "is_hero",
            "position",
            "alt_text",
          ].join(",")
        )
        .eq(
          "company_id",
          workspace.companyId
        )
        .eq(
          "fleet_id",
          yachtId
        )
        .eq("id", imageId)
        .maybeSingle();

    if (
      imageError ||
      !imageData
    ) {
      return errorResponse(
        "Yacht image not found.",
        404
      );
    }

    const image =
      imageData as unknown as YachtImageRow;

    const { error: deleteError } =
      await supabase
        .from(
          "yacht_images"
        )
        .delete()
        .eq(
          "company_id",
          workspace.companyId
        )
        .eq(
          "fleet_id",
          yachtId
        )
        .eq("id", imageId);

    if (deleteError) {
      throw new Error(
        `Could not delete yacht image: ${deleteError.message}`
      );
    }

    if (image.is_hero) {
      const {
        error:
          fleetUpdateError,
      } =
        await supabase
          .from("fleet")
          .update({
            hero_image_url:
              null,
            profile_updated_at:
              new Date().toISOString(),
          })
          .eq(
            "company_id",
            workspace.companyId
          )
          .eq(
            "id",
            yachtId
          );

      if (
        fleetUpdateError
      ) {
        console.error(
          "Deleted hero image but could not clear fleet.hero_image_url:",
          fleetUpdateError
        );
      }
    }

    const {
      error:
        storageError,
    } =
      await supabase.storage
        .from(BUCKET_NAME)
        .remove([
          image.storage_path,
        ]);

    if (
      storageError
    ) {
      console.error(
        "Deleted yacht image record but storage cleanup failed:",
        storageError
      );
    }

    return NextResponse.json(
      {
        success: true,
      },
      { status: 200 }
    );
  } catch (error) {
    return handleRouteError(
      error,
      "Could not delete yacht image."
    );
  }
}

function serializeImage(
  row: YachtImageRow
) {
  return {
    id: row.id,
    url:
      row.image_url,
    category:
      row.category,
    isHero:
      row.is_hero,
    position:
      row.position,
    altText:
      row.alt_text,
  };
}

function cleanText(
  value: unknown
): string | null {
  if (
    typeof value !==
    "string"
  ) {
    return null;
  }

  const cleaned =
    value.trim();

  return cleaned ||
    null;
}

function errorResponse(
  error: string,
  status: number
) {
  return NextResponse.json(
    {
      success: false,
      error,
    },
    { status }
  );
}

function handleRouteError(
  error: unknown,
  fallbackMessage: string
) {
  if (
    isAuthenticationRequiredError(
      error
    )
  ) {
    return errorResponse(
      error.message,
      error.status
    );
  }

  if (
    isWorkspaceAccessError(
      error
    )
  ) {
    return errorResponse(
      error.message,
      error.status
    );
  }

  const message =
    error instanceof Error
      ? error.message
      : fallbackMessage;

  console.error(
    "Yacht media API failed:",
    error
  );

  return errorResponse(
    message,
    500
  );
}