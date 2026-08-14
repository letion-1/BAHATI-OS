import {
  randomUUID,
} from "node:crypto";

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

const MAX_FILE_BYTES =
  15 * 1024 * 1024;

const IMAGE_TYPES =
  new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
  ]);

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
  }>;
};

type UploadedImage = {
  id: string;
  image_url: string;
  category: string;
  is_hero: boolean;
  position: number;
  alt_text: string | null;
};

export async function POST(
  request: NextRequest,
  context: RouteContext
) {
  const uploadedPaths: string[] = [];

  try {
    const { id: yachtId } =
      await context.params;

    if (!yachtId) {
      return errorResponse(
        "A yacht ID is required.",
        400
      );
    }

    const workspace =
      await getCurrentWorkspace();

    const supabase =
      await createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return errorResponse(
        "Authentication required.",
        401
      );
    }

    const { data: yacht, error: yachtError } =
      await supabase
        .from("fleet")
        .select("id, name")
        .eq(
          "company_id",
          workspace.companyId
        )
        .eq("id", yachtId)
        .maybeSingle();

    if (yachtError) {
      throw new Error(
        `Could not load yacht: ${yachtError.message}`
      );
    }

    if (!yacht) {
      return errorResponse(
        "Yacht not found.",
        404
      );
    }

    const formData =
      await request.formData();

    const kind =
      cleanText(
        formData.get("kind")
      ) === "hero"
        ? "hero"
        : "gallery";

    const requestedCategory =
      cleanText(
        formData.get("category")
      ) ??
      (kind === "hero"
        ? "exterior"
        : "other");

    const category =
      IMAGE_CATEGORIES.has(
        requestedCategory
      )
        ? requestedCategory
        : "other";

    const altText =
      cleanText(
        formData.get("altText")
      );

    const fileEntries = [
      ...formData.getAll(
        "files"
      ),
      formData.get("file"),
    ].filter(
      (value): value is File =>
        value instanceof File &&
        value.size > 0
    );

    const uniqueFiles =
      Array.from(
        new Set(fileEntries)
      );

    if (
      uniqueFiles.length === 0
    ) {
      return errorResponse(
        "Choose at least one image to upload.",
        400
      );
    }

    if (
      kind === "hero" &&
      uniqueFiles.length !== 1
    ) {
      return errorResponse(
        "Upload exactly one image for the hero image.",
        400
      );
    }

    if (
      uniqueFiles.length > 20
    ) {
      return errorResponse(
        "Upload no more than 20 images at a time.",
        400
      );
    }

    for (const file of uniqueFiles) {
      if (
        !IMAGE_TYPES.has(
          file.type
        )
      ) {
        return errorResponse(
          `${file.name || "Image"} must be JPEG, PNG or WebP.`,
          400
        );
      }

      if (
        file.size >
        MAX_FILE_BYTES
      ) {
        return errorResponse(
          `${file.name || "Image"} is larger than 15 MB.`,
          400
        );
      }
    }

    const { data: positionRows, error: positionError } =
      await supabase
        .from("yacht_images")
        .select("position")
        .eq(
          "company_id",
          workspace.companyId
        )
        .eq("fleet_id", yachtId)
        .order(
          "position",
          { ascending: false }
        )
        .limit(1);

    if (positionError) {
      throw new Error(
        `Could not inspect yacht media: ${positionError.message}`
      );
    }

    let nextPosition =
      ((positionRows?.[0] as {
        position?: number;
      } | undefined)
        ?.position ?? 0) + 1;

    if (
      kind === "hero"
    ) {
      const { error: clearHeroError } =
        await supabase
          .from(
            "yacht_images"
          )
          .update({
            is_hero: false,
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

      if (clearHeroError) {
        throw new Error(
          `Could not replace the existing hero image: ${clearHeroError.message}`
        );
      }
    }

    const created: UploadedImage[] =
      [];

    for (
      let index = 0;
      index <
      uniqueFiles.length;
      index += 1
    ) {
      const file =
        uniqueFiles[index];

      const extension =
        extensionForFile(
          file
        );

      const storagePath =
        `${workspace.companyId}/${yachtId}/${randomUUID()}.${extension}`;

      const arrayBuffer =
        await file.arrayBuffer();

      const { error: uploadError } =
        await supabase.storage
          .from(BUCKET_NAME)
          .upload(
            storagePath,
            Buffer.from(
              arrayBuffer
            ),
            {
              contentType:
                file.type,
              cacheControl:
                "31536000",
              upsert: false,
            }
          );

      if (uploadError) {
        throw new Error(
          `Could not upload ${file.name || "image"}: ${uploadError.message}`
        );
      }

      uploadedPaths.push(
        storagePath
      );

      const {
        data: publicUrlData,
      } =
        supabase.storage
          .from(BUCKET_NAME)
          .getPublicUrl(
            storagePath
          );

      const imageUrl =
        publicUrlData
          .publicUrl;

      const isHero =
        kind === "hero" &&
        index === 0;

      const { data: row, error: rowError } =
        await supabase
          .from(
            "yacht_images"
          )
          .insert({
            company_id:
              workspace.companyId,
            fleet_id:
              yachtId,
            storage_path:
              storagePath,
            image_url:
              imageUrl,
            category,
            is_hero:
              isHero,
            position:
              nextPosition,
            alt_text:
              altText,
            created_by:
              user.id,
          })
          .select(
            [
              "id",
              "image_url",
              "category",
              "is_hero",
              "position",
              "alt_text",
            ].join(",")
          )
          .single();

      if (
        rowError ||
        !row
      ) {
        throw new Error(
          `Could not save yacht media: ${
            rowError?.message ??
            "Unknown database error."
          }`
        );
      }

      created.push(
        row as unknown as UploadedImage
      );

      nextPosition += 1;

      if (isHero) {
        const {
          error: fleetUpdateError,
        } =
          await supabase
            .from("fleet")
            .update({
              hero_image_url:
                imageUrl,
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
            `Hero image uploaded, but the yacht profile could not be updated: ${fleetUpdateError.message}`
          );
        }
      }
    }

    return NextResponse.json(
      {
        success: true,
        kind,
        images:
          created.map(
            serializeImage
          ),
      },
      { status: 201 }
    );
  } catch (error) {
    if (
      uploadedPaths.length >
      0
    ) {
      try {
        const supabase =
          await createClient();

        await supabase.storage
          .from(BUCKET_NAME)
          .remove(
            uploadedPaths
          );
      } catch {
        // Best-effort cleanup only.
      }
    }

    return handleRouteError(
      error,
      "Could not upload yacht media."
    );
  }
}

function serializeImage(
  row: UploadedImage
) {
  return {
    id: row.id,
    url: row.image_url,
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

function extensionForFile(
  file: File
): string {
  switch (
    file.type
  ) {
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    default:
      return "jpg";
  }
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
    "Yacht media upload failed:",
    error
  );

  return errorResponse(
    message,
    500
  );
}