import { login } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="login-wrap">
      <div className="card login-card">
        <h2>ورود به پنل میرور</h2>
        <p className="muted">با یوزرنیم/رمز ادمین Nexus وارد شو.</p>
        {error && <div className="alert danger">{error}</div>}
        <form action={login}>
          <input name="username" placeholder="یوزرنیم" autoComplete="username" required />
          <input
            name="password"
            type="password"
            placeholder="رمز عبور"
            autoComplete="current-password"
            required
          />
          <button type="submit" className="primary">
            ورود
          </button>
        </form>
      </div>
    </div>
  );
}
