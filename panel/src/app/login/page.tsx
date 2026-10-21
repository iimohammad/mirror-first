import { Radar, TriangleAlert } from "lucide-react";
import { login } from "./actions";
import { ThemeToggle } from "@/components/theme-toggle";
import { SubmitButton } from "@/components/submit-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="relative flex min-h-screen items-center justify-center p-4">
      <div className="absolute top-4 end-4">
        <ThemeToggle />
      </div>

      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <div className="mx-auto mb-2 flex aspect-square size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Radar className="size-6" />
          </div>
          <CardTitle className="text-xl">ورود به پنل میرور</CardTitle>
          <CardDescription>با یوزرنیم/رمز ادمین Nexus وارد شو.</CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <TriangleAlert />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <form action={login} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="username">یوزرنیم</Label>
              <Input
                id="username"
                name="username"
                placeholder="admin"
                autoComplete="username"
                autoFocus
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">رمز عبور</Label>
              <Input
                id="password"
                name="password"
                type="password"
                placeholder="••••••••"
                autoComplete="current-password"
                required
              />
            </div>
            <SubmitButton className="w-full" pendingText="در حال ورود…">
              ورود
            </SubmitButton>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
