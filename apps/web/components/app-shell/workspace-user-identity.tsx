"use client";

import { useEffect, useMemo, useState } from "react";

import {
  Avatar,
  AvatarFallback,
} from "@/components/ui/avatar";

type Account = {
  id: string;
  email: string | null;
  fullName: string;
  roleTitle: string;
  membershipRole: string | null;
  companyId: string | null;
  companyName: string | null;
  memberSince: string | null;
};

type AccountResponse = {
  success: boolean;
  account?: Account;
  error?: string;
};

export function WorkspaceUserIdentity() {
  const [account, setAccount] =
    useState<Account | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadAccount() {
      try {
        const response = await fetch(
          "/api/account",
          {
            method: "GET",
            cache: "no-store",
          }
        );

        const payload =
          (await response.json()) as AccountResponse;

        if (
          cancelled ||
          !response.ok ||
          !payload.success ||
          !payload.account
        ) {
          return;
        }

        setAccount(payload.account);
      } catch {
        // Keep the neutral fallback if account data cannot be loaded.
      }
    }

    void loadAccount();

    return () => {
      cancelled = true;
    };
  }, []);

  const displayName =
    account?.fullName?.trim() ||
    account?.email?.split("@")[0] ||
    "Bahari OS user";

  const initials = useMemo(
    () => getInitials(displayName),
    [displayName]
  );

  const roleLabel =
    formatWorkspaceRole(
      account?.membershipRole
    );

  return (
    <div className="flex min-w-0 items-center gap-3">
      <Avatar>
        <AvatarFallback className="bg-secondary text-secondary-foreground">
          {initials}
        </AvatarFallback>
      </Avatar>

      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">
          {displayName}
        </p>

        <p className="truncate text-xs text-muted-foreground">
          {roleLabel}
        </p>
      </div>
    </div>
  );
}

function getInitials(
  displayName: string
) {
  const words =
    displayName
      .trim()
      .split(/\s+/)
      .filter(Boolean);

  if (words.length === 0) {
    return "YO";
  }

  if (words.length === 1) {
    return words[0]
      .slice(0, 2)
      .toUpperCase();
  }

  return `${words[0][0]}${
    words[words.length - 1][0]
  }`.toUpperCase();
}

function formatWorkspaceRole(
  role: string | null | undefined
) {
  if (!role) {
    return "Workspace member";
  }

  const labels: Record<
    string,
    string
  > = {
    owner: "Workspace owner",
    admin: "Workspace admin",
    broker: "Charter broker",
    manager: "Workspace manager",
    member: "Workspace member",
    viewer: "Workspace viewer",
  };

  return (
    labels[role] ??
    role
      .replaceAll("_", " ")
      .replace(
        /\b\w/g,
        (character) =>
          character.toUpperCase()
      )
  );
} 