"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Cable,
  FolderUp,
  Globe,
  HardDrive,
  LayoutDashboard,
  LogOut,
  Package,
  Radar,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { logout } from "@/app/(protected)/logout/actions";

const NAV_ITEMS = [
  { title: "داشبورد", url: "/", icon: LayoutDashboard },
  { title: "مدیریت IP", url: "/ips", icon: Globe },
  { title: "پکیج‌ها", url: "/packages", icon: Package },
  { title: "آپلود", url: "/upload", icon: FolderUp },
  { title: "دیسک و Cleanup", url: "/disk", icon: HardDrive },
  { title: "اتصال سرورها", url: "/connect", icon: Cable },
];

export function AppSidebar({ username }: { username: string }) {
  const pathname = usePathname();
  const isActive = (url: string) =>
    url === "/" ? pathname === "/" : pathname.startsWith(url);

  return (
    <Sidebar>
      <SidebarHeader className="border-b">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <Radar className="size-4" />
                </div>
                <div className="flex flex-col gap-0.5 leading-none">
                  <span className="font-semibold">پنل میرور</span>
                  <span className="text-xs text-muted-foreground">Nexus Repository</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>مدیریت</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV_ITEMS.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={item.title}>
                    <Link href={item.url}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t">
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="flex items-center gap-2 px-2 py-1.5 text-sm">
              <div className="flex aspect-square size-8 shrink-0 items-center justify-center rounded-full bg-muted">
                <span className="text-xs font-medium">{username.slice(0, 2)}</span>
              </div>
              <div className="flex min-w-0 flex-col">
                <span className="truncate font-medium">{username}</span>
                <span className="truncate text-xs text-muted-foreground">ادمین Nexus</span>
              </div>
            </div>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <form action={logout}>
              <SidebarMenuButton type="submit" tooltip="خروج">
                <LogOut />
                <span>خروج</span>
              </SidebarMenuButton>
            </form>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
