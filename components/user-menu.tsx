"use client";

import Link from "next/link";
import { LogOut, UserRound } from "lucide-react";
import { logout } from "@/app/login/actions";
import type { Profile } from "@/lib/types/database";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

export function UserMenu({ profile }: { profile: Profile }) {
  const initials = profile.full_name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <DropdownMenu>
      {/* shadcn's dropdown-menu is Base UI-based: composition uses `render`, not `asChild` */}
      <DropdownMenuTrigger render={<Button variant="ghost" className="gap-2 px-2" />}>
        <Avatar className="h-8 w-8">
          <AvatarImage src={profile.avatar_url ?? undefined} alt="" />
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
        <span className="hidden text-sm md:inline">{profile.full_name}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {/* Base UI's GroupLabel throws unless it's inside a Group */}
        <DropdownMenuGroup>
          <DropdownMenuLabel className="capitalize">{profile.role}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem render={<Link href="/profile" />}>
            <UserRound className="mr-2 h-4 w-4" /> My profile
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => logout()}>
          <LogOut className="mr-2 h-4 w-4" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
