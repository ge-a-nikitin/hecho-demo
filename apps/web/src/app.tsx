import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  BrowserRouter,
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { authClient } from "./auth-client";
import { apiRequest } from "./api";
import { AdminCategoriesPage, AdminUsersPage } from "./admin-pages";
import { AdminOrdersPage, ExecutorOrdersPage } from "./role-order-panels";
import {
  OrderListControls,
  OrderPagination,
  emptyOrderFilters,
  filterOrders,
  getOrderCategoryOptions,
  paginateOrders,
  type OrderFilterValues,
} from "./order-list-controls";
import { OrderDetailView } from "./order-detail";
import { ToastProvider, useToast } from "./toast";
import { useI18n } from "./i18n";
import { LanguageSwitcher } from "./language-switcher";

type Role = "CUSTOMER" | "EXECUTOR" | "ADMIN";

type Category = {
  id: string;
  name: string;
};

type WorkOrder = {
  id: string;
  title: string;
  description: string;
  status: string;
  category: Category;
  executor?: { id: string; name: string } | null;
  createdAt: string;
  dueAt: string | null;
  location: string | null;
  acceptedAt?: string | null;
  estimates?: { id: string; hours: number | string; amount: number | string; status: string }[];
  invoices?: {
    id: string;
    number: string;
    amount: number | string;
    status: string;
    paymentReports?: {
      id: string;
      filename: string;
      status: string;
      reviewComment: string | null;
      submittedAt: string;
    }[];
  }[];
};

type CreateOrderInput = {
  title: string;
  description: string;
  categoryId: string;
  executorId?: string;
  dueAt?: string;
  location?: string;
};

const panelPaths: Record<Role, string> = {
  CUSTOMER: "/customer",
  EXECUTOR: "/executor",
  ADMIN: "/admin",
};

export function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<AuthPage mode="login" />} />
          <Route path="/register" element={<AuthPage mode="register" />} />
          <Route path="/customer/*" element={<PanelRoute role="CUSTOMER" />} />
          <Route path="/executor/*" element={<PanelRoute role="EXECUTOR" />} />
          <Route path="/admin/*" element={<PanelRoute role="ADMIN" />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </ToastProvider>
    </BrowserRouter>
  );
}

function LandingPage() {
  const { data: session, isPending } = authClient.useSession();
  const role = session ? getRole(session.user) : undefined;
  const { t } = useI18n();

  return (
    <main className="landing" data-testid="landing-page">
      <header className="topbar wrap">
        <Link className="brand" to="/" aria-label={t.landing.brandAria} data-testid="brand-home">
          <span className="brand-mark" aria-hidden="true">H</span>
          <span>HECHO<span className="brand-period">.</span></span>
        </Link>
        <LanguageSwitcher />
        <nav className="topnav" aria-label={t.landing.navAria}>
          <a href="#how-it-works" data-testid="nav-how-it-works">{t.landing.howItWorks}</a>
          <a href="#for-whom" data-testid="nav-for-whom">{t.landing.forWhom}</a>
          {!isPending && role ? (
            <Link className="button button-dark button-small" to={panelPaths[role]} data-testid="nav-dashboard">
              {t.landing.myWorkspace}
            </Link>
          ) : (
            <Link className="button button-dark button-small" to="/login" data-testid="nav-login">
              {t.landing.signIn}
            </Link>
          )}
        </nav>
      </header>

      <section className="hero wrap">
        <div className="hero-copy">
          <div className="eyebrow"><span className="eyebrow-dot" /> {t.landing.eyebrow}</div>
          <h1>{t.landing.titleLead}<br /><span>{t.landing.titleAccent}</span></h1>
          <p className="hero-text">
            {t.landing.text}
          </p>
          <div className="hero-actions">
            <Link className="button button-primary" to={role ? panelPaths[role] : "/register"} data-testid="hero-register">
              {role === "CUSTOMER" ? t.landing.ctaCustomer : role ? t.landing.ctaOpenWorkspace : t.landing.ctaCreate} <span aria-hidden="true">↗</span>
            </Link>
            <Link className="button button-quiet" to="/login" data-testid="hero-login">
              {t.landing.haveAccount} <span>{t.landing.signInAction}</span>
            </Link>
          </div>
          <div className="hero-note">
            <span className="avatar-stack" aria-hidden="true"><i>{t.landing.avatarFirst}</i><i>{t.landing.avatarSecond}</i><i>{t.landing.avatarThird}</i></span>
            <span>{t.landing.note}</span>
          </div>
        </div>

        <div className="hero-visual" role="img" aria-label={t.landing.visualAria}>
          <div className="visual-glow" />
          <div className="task-card task-card-main">
            <div className="task-card-top">
              <span className="task-icon" aria-hidden="true">✳</span>
              <span className="task-status"><i /> {t.landing.taskStatus}</span>
              <span className="more-dots" aria-hidden="true">···</span>
            </div>
            <span className="task-category">{t.landing.taskCategory}</span>
            <h2>{t.landing.taskTitleLead}<br />{t.landing.taskTitleAccent}</h2>
            <p className="task-subtitle">{t.landing.taskSubtitle}</p>
            <div className="task-divider" />
            <div className="task-footer">
              <div className="task-person"><span className="person-avatar">{t.landing.personAvatar}</span><span><b>{t.landing.personName}</b><small>{t.landing.personRole}</small></span></div>
              <div className="progress-ring"><span>68<small>%</small></span></div>
            </div>
          </div>
          <div className="floating-note">
            <span className="note-check">✓</span>
            <span><b>{t.landing.stageDone}</b><small>{t.landing.stageDoneText}</small></span>
          </div>
          <div className="visual-caption"><span /> {t.landing.visualCaption}</div>
        </div>
      </section>

      <section className="process-section" id="how-it-works">
        <div className="wrap">
          <div className="section-heading">
            <div><div className="eyebrow">{t.landing.processEyebrow}</div><h2>{t.landing.processTitle}</h2></div>
            <p>{t.landing.processText}</p>
          </div>
          <div className="steps-grid">
            <Step number="01" title={t.landing.step1Title} text={t.landing.step1Text} />
            <Step number="02" title={t.landing.step2Title} text={t.landing.step2Text} />
            <Step number="03" title={t.landing.step3Title} text={t.landing.step3Text} />
          </div>
        </div>
      </section>

      <section className="audience-section wrap" id="for-whom">
        <div className="audience-copy">
          <div className="eyebrow">{t.landing.audienceEyebrow}</div>
          <h2>{t.landing.audienceTitleLead}<br />{t.landing.audienceTitleAccent}</h2>
          <p>{t.landing.audienceText}</p>
          <Link className="text-link" to="/register" data-testid="audience-register">{t.landing.audienceCta} <span aria-hidden="true">→</span></Link>
        </div>
        <div className="roles-list">
          <RoleRow mark={t.landing.roleCustomerMark} title={t.landing.roleCustomerTitle} text={t.landing.roleCustomerText} />
          <RoleRow mark={t.landing.roleExecutorMark} title={t.landing.roleExecutorTitle} text={t.landing.roleExecutorText} />
          <RoleRow mark={t.landing.roleAdminMark} title={t.landing.roleAdminTitle} text={t.landing.roleAdminText} />
        </div>
      </section>

      <footer className="footer">
        <div className="wrap footer-inner">
          <Link className="brand" to="/" data-testid="footer-brand"><span className="brand-mark" aria-hidden="true">H</span><span>HECHO<span className="brand-period">.</span></span></Link>
          <span>{t.landing.footerTagline}</span>
          <Link to="/login" data-testid="footer-login">{t.landing.footerLogin} <span aria-hidden="true">↗</span></Link>
        </div>
      </footer>
    </main>
  );
}

function Step({ number, title, text }: { number: string; title: string; text: string }) {
  return (
    <article className="step-card" data-testid={`process-step-${number}`}>
      <span className="step-number">{number}</span>
      <h3>{title}</h3>
      <p>{text}</p>
      <span className="step-arrow" aria-hidden="true">↗</span>
    </article>
  );
}

function RoleRow({ mark, title, text }: { mark: string; title: string; text: string }) {
  return (
    <div className="role-row">
      <span className="role-mark">{mark}</span>
      <span><b>{title}</b><small>{text}</small></span>
      <span className="role-arrow" aria-hidden="true">↗</span>
    </div>
  );
}

function AuthPage({ mode }: { mode: "login" | "register" }) {
  const isRegister = mode === "register";
  const navigate = useNavigate();
  const location = useLocation();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { showToast } = useToast();
  const { t, errorMessage } = useI18n();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    try {
      const result = isRegister
        ? await authClient.signUp.email({ name: name.trim(), email: email.trim(), password })
        : await authClient.signIn.email({ email: email.trim(), password });
      if (result.error) {
        showToast(isRegister
          ? t.auth.errorRegister
          : t.auth.errorLogin);
        return;
      }

      const sessionResult = await authClient.getSession();
      if (!sessionResult.data) {
        showToast(t.auth.errorSession);
        return;
      }
      const role = getRole(sessionResult.data.user);
      if (!role) {
        showToast(t.auth.errorNoRole);
        return;
      }
      const requestedPath = (location.state as { from?: unknown } | null)?.from;
      const panelPath = panelPaths[role];
      const destination =
        typeof requestedPath === "string" &&
        (requestedPath === panelPath || requestedPath.startsWith(`${panelPath}/`))
          ? requestedPath
          : panelPath;
      navigate(destination, { replace: true });
    } catch (submitError) {
      showToast(errorMessage(
        submitError,
        t.auth.errorSubmit,
      ));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="auth-page" data-testid={isRegister ? "register-page" : "login-page"}>
      <LanguageSwitcher />
      <Link className="brand auth-brand" to="/" data-testid="auth-brand" aria-label={t.auth.brandAria}><span className="brand-mark" aria-hidden="true">H</span><span>HECHO<span className="brand-period">.</span></span></Link>
      <section className="auth-card">
        <Link className="back-link" to="/" data-testid="auth-back">← {t.auth.back}</Link>
        <div className="eyebrow">{isRegister ? t.auth.registerEyebrow : t.auth.loginEyebrow}</div>
        <h1>{isRegister ? t.auth.registerTitle : t.auth.loginTitle}</h1>
        <p className="auth-description">{isRegister ? t.auth.registerDescription : t.auth.loginDescription}</p>
        <form className="auth-form" onSubmit={submit} data-testid="auth-form">
          {isRegister && (
            <label>
              {t.auth.name}
              <input autoComplete="name" name="name" value={name} onChange={(event) => setName(event.target.value)} required minLength={2} data-testid="auth-name" />
            </label>
          )}
          <label>
            {t.auth.email}
            <input autoComplete="email" name="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required data-testid="auth-email" />
          </label>
          <label>
            {t.auth.password}
            <input autoComplete={isRegister ? "new-password" : "current-password"} name="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} data-testid="auth-password" />
          </label>
          <button className="button button-primary auth-submit" type="submit" disabled={isSubmitting} data-testid="auth-submit">
            {isSubmitting ? t.auth.submitting : isRegister ? t.auth.submitRegister : t.auth.submitLogin}
          </button>
        </form>
        <p className="auth-switch">
          {isRegister ? t.auth.haveAccount : t.auth.noAccount}{" "}
          <Link to={isRegister ? "/login" : "/register"} state={location.state} data-testid="auth-switch">
            {isRegister ? t.auth.signIn : t.auth.signUp}
          </Link>
        </p>
      </section>
      <p className="auth-footer">{t.auth.footer}</p>
    </main>
  );
}

function PanelRoute({ role }: { role: Role }) {
  const { data: session, isPending } = authClient.useSession();
  const location = useLocation();

  if (isPending) return <LoadingPage />;
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (getRole(session.user) !== role) {
    const userRole = getRole(session.user);
    return <Navigate to={userRole ? panelPaths[userRole] : "/"} replace />;
  }

  return <PanelPage role={role} user={session.user} />;
}

function PanelPage({
  role,
  user,
}: {
  role: Role;
  user: { id: string; name: string; email: string };
}) {
  const { t, errorMessage } = useI18n();
  const panel = {
    path: panelPaths[role],
    label: t.roles[role],
    title: t.roleTitles[role],
    description: t.roleDescriptions[role],
  };
  const location = useLocation();
  const navigate = useNavigate();
  const relativePath = location.pathname.slice(panel.path.length).replace(/\/+$/u, "") || "/";
  const isProfile = relativePath === "/profile";
  const isCategories = role === "ADMIN" && relativePath === "/categories";
  const isUsers = role === "ADMIN" && relativePath === "/users";
  const isOrders = !isProfile && !isCategories && !isUsers;
  const orderMatch = location.pathname.match(new RegExp(`^${panel.path}/orders/([^/]+)$`, "u"));
  const orderId = orderMatch ? decodeRouteSegment(orderMatch[1]) : null;
  const [userName, setUserName] = useState(user.name);
  const [userEmail, setUserEmail] = useState(user.email);
  useEffect(() => setUserName(user.name), [user.name]);
  useEffect(() => setUserEmail(user.email), [user.email]);
  const title = isProfile ? t.panel.profile : isCategories ? t.panel.categories : isUsers ? t.panel.users : panel.title;
  const eyebrow = isProfile ? t.panel.profileEyebrow : isCategories || isUsers ? t.panel.managementEyebrow : t.panel.workspaceEyebrow;
  const description = isProfile
    ? t.panel.profileDescription
    : isCategories
      ? t.panel.categoriesDescription
      : isUsers
        ? t.panel.usersDescription
        : panel.description;
  const [isSigningOut, setIsSigningOut] = useState(false);
  const { showToast } = useToast();

  async function signOut() {
    setIsSigningOut(true);
    try {
      const result = await authClient.signOut();
      if (result.error) {
        showToast(errorMessage(result.error, t.toasts.signOutFailed));
        return;
      }
      navigate("/", { replace: true });
    } catch (error) {
      showToast(errorMessage(error, t.toasts.signOutFailed));
    } finally {
      setIsSigningOut(false);
    }
  }

  return (
    <main className="panel-page" data-testid={`${role.toLowerCase()}-panel`}>
      <aside className="panel-sidebar">
        <Link className="brand" to="/" data-testid="panel-brand"><span className="brand-mark" aria-hidden="true">H</span><span>HECHO<span className="brand-period">.</span></span></Link>
        <div className="panel-role-label">{panel.label.toUpperCase()}</div>
        <nav className="panel-nav" aria-label={t.panel.navAria}>
          <Link className={`panel-nav-item${isOrders ? " active" : ""}`} to={panel.path} data-testid="panel-orders-link"><span aria-hidden="true">▦</span>{t.panel.orders}</Link>
          {role === "ADMIN" && (
            <Link className={`panel-nav-item${isCategories ? " active" : ""}`} to={`${panel.path}/categories`} data-testid="panel-categories-link"><span aria-hidden="true">▤</span>{t.panel.categories}</Link>
          )}
          {role === "ADMIN" && (
            <Link className={`panel-nav-item${isUsers ? " active" : ""}`} to={`${panel.path}/users`} data-testid="panel-users-link"><span aria-hidden="true">◌</span>{t.panel.users}</Link>
          )}
          <Link className={`panel-nav-item${isProfile ? " active" : ""}`} to={`${panel.path}/profile`} data-testid="panel-profile-link"><span aria-hidden="true">◉</span>{t.panel.profile}</Link>
        </nav>
        <div className="sidebar-bottom">
          <div className="user-chip"><span className="user-avatar">{userName.slice(0, 1).toUpperCase()}</span><span><b>{userName}</b><small>{panel.label}</small></span></div>
          <button className="signout-button" onClick={signOut} disabled={isSigningOut} data-testid="sign-out">
            {isSigningOut ? t.panel.signingOut : t.panel.signOut}
          </button>
        </div>
      </aside>
      <section className="panel-content">
        <header className="panel-topbar">
          <span>{panel.label}</span>
          <div className="panel-topbar-actions">
            <span className="online-indicator"><i /> {t.panel.workspace}</span>
            <LanguageSwitcher />
            <button
              className="mobile-signout-button"
              type="button"
              onClick={signOut}
              disabled={isSigningOut}
              data-testid="mobile-sign-out"
            >
              {isSigningOut ? t.panel.signingOut : t.panel.signOut}
            </button>
          </div>
        </header>
        <div className="panel-inner">
          <div className="panel-heading">
            <div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>
          </div>
          {role === "ADMIN" && isCategories ? (
            <AdminCategoriesPage />
          ) : role === "ADMIN" && isUsers ? (
            <AdminUsersPage />
          ) : role === "CUSTOMER" && isOrders ? (
            <CustomerOrdersPage />
          ) : role === "EXECUTOR" && isOrders ? (
            <ExecutorOrdersPage />
          ) : role === "ADMIN" && isOrders ? (
            <AdminOrdersPage />
          ) : isProfile ? (
            <ProfilePage
              user={{ ...user, name: userName, email: userEmail, role }}
              onProfileChanged={(updated) => {
                setUserName(updated.name);
                setUserEmail(updated.email);
              }}
            />
          ) : null}
        </div>
      </section>
      {orderId && (
        <OrderDetailView
          orderId={orderId}
          panelPath={panel.path}
          role={role}
          onClose={() => navigate(panel.path)}
        />
      )}
    </main>
  );
}

function ProfilePage({
  user,
  onProfileChanged,
}: {
  user: { id: string; name: string; email: string; role: Role };
  onProfileChanged: (user: { name: string; email: string }) => void;
}) {
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [profileCurrentPassword, setProfileCurrentPassword] = useState("");
  const [passwordCurrentPassword, setPasswordCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [hourlyRate, setHourlyRate] = useState("");
  const [isLoadingRate, setIsLoadingRate] = useState(user.role === "EXECUTOR");
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isSavingRate, setIsSavingRate] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const { showToast } = useToast();
  const { t, errorMessage } = useI18n();

  useEffect(() => {
    setName(user.name);
    setEmail(user.email);
  }, [user.name, user.email]);

  useEffect(() => {
    if (user.role !== "EXECUTOR") return;
    let cancelled = false;
    setIsLoadingRate(true);
    apiRequest<{ hourlyRate: number | string | null }>("/users/me")
      .then((profile) => {
        if (cancelled) return;
        setHourlyRate(profile.hourlyRate === null ? "" : String(profile.hourlyRate));
      })
      .catch((error: unknown) => {
        if (!cancelled) showToast(errorMessage(error, t.toasts.loadRateFailed));
      })
      .finally(() => {
        if (!cancelled) setIsLoadingRate(false);
      });
    return () => {
      cancelled = true;
    };
  }, [showToast, user.role]);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const updatedName = name.trim();
    const updatedEmail = email.trim().toLowerCase();
    const changes: { name?: string; email?: string } = {};
    if (updatedName !== user.name) changes.name = updatedName;
    if (updatedEmail !== user.email.toLowerCase()) changes.email = updatedEmail;
    if (Object.keys(changes).length === 0) {
      showToast(t.toasts.noChanges);
      return;
    }

    setIsSavingProfile(true);
    try {
      const updated = await apiRequest<{ name: string; email: string }>("/users/me/profile", {
        method: "PATCH",
        body: JSON.stringify({ ...changes, currentPassword: profileCurrentPassword }),
      });
      setName(updated.name);
      setEmail(updated.email);
      setProfileCurrentPassword("");
      onProfileChanged(updated);
      showToast(t.toasts.profileUpdated, "success");
    } catch (error) {
      showToast(errorMessage(error, t.toasts.updateProfileFailed));
    } finally {
      setIsSavingProfile(false);
    }
  }

  async function saveHourlyRate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const rate = Number(hourlyRate);
    if (!Number.isFinite(rate) || rate <= 0) {
      showToast(t.toasts.invalidRate);
      return;
    }

    setIsSavingRate(true);
    try {
      const updated = await apiRequest<{ hourlyRate: number | string }>("/users/me/hourly-rate", {
        method: "PATCH",
        body: JSON.stringify({ hourlyRate: rate }),
      });
      setHourlyRate(String(updated.hourlyRate));
      showToast(t.toasts.rateUpdated, "success");
    } catch (error) {
      showToast(errorMessage(error, t.toasts.saveRateFailed));
    } finally {
      setIsSavingRate(false);
    }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (newPassword !== confirmPassword) {
      showToast(t.toasts.passwordsMismatch);
      return;
    }

    setIsChangingPassword(true);
    try {
      const result = await authClient.changePassword({
        currentPassword: passwordCurrentPassword,
        newPassword,
        revokeOtherSessions: true,
      });
      if (result.error) {
        showToast(errorMessage(result.error, t.toasts.passwordChangeFailed));
        return;
      }
      setPasswordCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      showToast(t.toasts.passwordChanged, "success");
    } catch (error) {
      showToast(errorMessage(error, t.toasts.passwordChangeFailed));
    } finally {
      setIsChangingPassword(false);
    }
  }

  return (
    <section className="profile-content" data-testid="profile-page">
      <article className="profile-card">
        <div className="profile-card-heading">
          <span className="profile-avatar" aria-hidden="true">{user.name.slice(0, 1).toUpperCase()}</span>
          <div>
            <h2>{t.profile.accountTitle}</h2>
            <p>{t.profile.accountDescription}</p>
          </div>
        </div>
        <form className="profile-form" onSubmit={saveProfile} data-testid="profile-form">
          <label>
            {t.profile.name}
            <input value={name} onChange={(event) => setName(event.target.value)} minLength={1} maxLength={120} required data-testid="profile-name" />
          </label>
          <label>
            {t.profile.email}
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={254} required data-testid="profile-email" />
          </label>
          <label>
            {t.profile.currentPassword}
            <input type="password" value={profileCurrentPassword} onChange={(event) => setProfileCurrentPassword(event.target.value)} autoComplete="current-password" minLength={1} required data-testid="profile-current-password" />
          </label>
          <p className="profile-help">{t.profile.profileHelp}</p>
          <button className="button button-primary" type="submit" disabled={isSavingProfile || !profileCurrentPassword} data-testid="save-profile">
            {isSavingProfile ? t.common.saving : t.profile.save}
          </button>
        </form>
      </article>
      {user.role === "EXECUTOR" && (
        <article className="profile-card" data-testid="executor-rate-card">
          <div className="profile-card-heading">
            <span className="profile-avatar profile-avatar-rate" aria-hidden="true">$</span>
            <div>
              <h2>{t.profile.rateTitle}</h2>
              <p>{t.profile.rateDescription}</p>
            </div>
          </div>
          <form className="profile-form" onSubmit={saveHourlyRate} data-testid="hourly-rate-form">
            <label>
              {t.profile.rateLabel}
              <input
                type="number"
                min="0.0001"
                max="1000000"
                step="0.0001"
                required
                placeholder={t.profile.ratePlaceholder}
                value={hourlyRate}
                onChange={(event) => setHourlyRate(event.target.value)}
                disabled={isLoadingRate || isSavingRate}
                data-testid="profile-hourly-rate"
              />
            </label>
            <p className="profile-help">{t.profile.rateHelp}</p>
            <button
              className="button button-primary"
              type="submit"
              disabled={isLoadingRate || isSavingRate || !hourlyRate}
              data-testid="save-hourly-rate"
            >
              {isLoadingRate ? t.common.loading : isSavingRate ? t.common.saving : t.profile.saveRate}
            </button>
          </form>
        </article>
      )}
      <article className="profile-card">
        <div className="profile-card-heading">
          <span className="profile-avatar profile-avatar-password" aria-hidden="true">⌑</span>
          <div>
            <h2>{t.profile.passwordTitle}</h2>
            <p>{t.profile.passwordDescription}</p>
          </div>
        </div>
        <form className="profile-form" onSubmit={changePassword} data-testid="password-change-form">
          <label>
            {t.profile.currentPassword}
            <input type="password" value={passwordCurrentPassword} onChange={(event) => setPasswordCurrentPassword(event.target.value)} autoComplete="current-password" minLength={1} required data-testid="password-current" />
          </label>
          <label>
            {t.profile.newPassword}
            <input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" minLength={8} maxLength={128} required data-testid="password-new" />
          </label>
          <label>
            {t.profile.confirmPassword}
            <input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" minLength={8} maxLength={128} required data-testid="password-confirm" />
          </label>
          <button className="button button-primary" type="submit" disabled={isChangingPassword || !passwordCurrentPassword} data-testid="change-password">
            {isChangingPassword ? t.profile.changingPassword : t.profile.changePassword}
          </button>
        </form>
      </article>
      <div className="profile-role-note" data-testid="profile-role">
        <span>{t.profile.roleLabel}</span>
        <b>{t.roles[user.role]}</b>
        <small>{t.profile.roleNote}</small>
      </div>
    </section>
  );
}

function CustomerOrdersPage() {
  const { t, locale, format, errorMessage, formatDate, formatAmount, statusLabel, invoiceStatusLabel } = useI18n();
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [executors, setExecutors] = useState<{ id: string; name: string }[]>([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState(true);
  const [isLoadingCategories, setIsLoadingCategories] = useState(true);
  const [ordersError, setOrdersError] = useState(false);
  const [categoriesError, setCategoriesError] = useState(false);
  const [revisionComments, setRevisionComments] = useState<Record<string, string>>({});
  const [estimateRejectComments, setEstimateRejectComments] = useState<Record<string, string>>({});
  const [reportingInvoiceId, setReportingInvoiceId] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [executorId, setExecutorId] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [location, setLocation] = useState("");
  const [editingOrderId, setEditingOrderId] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editCategoryId, setEditCategoryId] = useState("");
  const [editExecutorId, setEditExecutorId] = useState("");
  const [editDueAt, setEditDueAt] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [savingDraftId, setSavingDraftId] = useState("");
  const [submittingDraftId, setSubmittingDraftId] = useState("");
  const [orderFilters, setOrderFilters] = useState<OrderFilterValues>(emptyOrderFilters);
  const [ordersPage, setOrdersPage] = useState(1);
  const { showToast } = useToast();

  const loadOrders = useCallback(async () => {
    setIsLoadingOrders(true);
    setOrdersError(false);
    try {
      setOrders(await apiRequest<WorkOrder[]>("/orders"));
    } catch (error) {
      setOrdersError(true);
      showToast(errorMessage(error, t.customer.errorLoadOrders));
    } finally {
      setIsLoadingOrders(false);
    }
  }, [showToast]);

  const loadCategories = useCallback(async () => {
    setIsLoadingCategories(true);
    setCategoriesError(false);
    try {
      const availableCategories = await apiRequest<Category[]>("/categories");
      setCategories(availableCategories);
      setCategoryId((current) => current || availableCategories[0]?.id || "");
    } catch (error) {
      setCategoriesError(true);
      showToast(errorMessage(error, t.customer.errorLoadCategories));
    } finally {
      setIsLoadingCategories(false);
    }
  }, [showToast]);

  const loadExecutors = useCallback(async () => {
    try {
      setExecutors(await apiRequest<{ id: string; name: string }[]>("/users/executors/available"));
    } catch (error) {
      showToast(errorMessage(error, t.customer.errorLoadExecutors));
    }
  }, [showToast]);

  useEffect(() => {
    void Promise.all([loadOrders(), loadCategories(), loadExecutors()]);
  }, [loadOrders, loadCategories, loadExecutors]);

  const filteredOrders = filterOrders(orders, orderFilters, locale);
  const orderCategories = getOrderCategoryOptions(orders, locale);
  const { items: visibleOrders, page: currentPage, totalPages } = paginateOrders(
    filteredOrders,
    ordersPage,
  );

  function updateOrderFilters(next: OrderFilterValues) {
    setOrderFilters(next);
    setOrdersPage(1);
  }

  function resetOrderFilters() {
    setOrderFilters(emptyOrderFilters);
    setOrdersPage(1);
  }

  async function createOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const shouldSubmit = submitter instanceof HTMLElement && submitter.dataset.mode === "send";
    setIsSubmitting(true);

    try {
      const input: CreateOrderInput = {
        title: title.trim(),
        description: description.trim(),
        categoryId,
        ...(executorId ? { executorId } : {}),
        ...(dueAt ? { dueAt: new Date(`${dueAt}T00:00:00.000Z`).toISOString() } : {}),
        ...(location.trim() ? { location: location.trim() } : {}),
      };
      const draft = await apiRequest<WorkOrder>("/orders", {
        method: "POST",
        body: JSON.stringify(input),
      });

      setIsCreateOpen(false);
      setTitle("");
      setDescription("");
      setExecutorId("");
      setDueAt("");
      setLocation("");

      if (shouldSubmit) {
        try {
          await apiRequest<WorkOrder>(`/orders/${encodeURIComponent(draft.id)}/submit`, {
            method: "POST",
          });
          showToast(
            draft.executor
              ? t.customer.toastSentToExecutor
              : t.customer.toastSentForDistribution,
            "success",
          );
        } catch (error) {
          showToast(
            format(t.customer.draftPartialFailure, {
              error: errorMessage(error, t.customer.draftPartialFailureFallback),
            }),
          );
        }
      } else {
        showToast(t.customer.draftSaved, "success");
      }

      await loadOrders();
    } catch (error) {
      showToast(errorMessage(error, t.customer.errorCreate));
    } finally {
      setIsSubmitting(false);
    }
  }

  function startEditingDraft(order: WorkOrder) {
    setEditingOrderId(order.id);
    setEditTitle(order.title);
    setEditDescription(order.description);
    setEditCategoryId(order.category.id);
    setEditExecutorId(order.executor?.id ?? "");
    setEditDueAt(order.dueAt ? order.dueAt.slice(0, 10) : "");
    setEditLocation(order.location ?? "");
  }

  async function saveDraft(event: FormEvent<HTMLFormElement>, order: WorkOrder) {
    event.preventDefault();
    setSavingDraftId(order.id);
    try {
      await apiRequest(`/orders/${encodeURIComponent(order.id)}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: editTitle.trim(),
          description: editDescription.trim(),
          categoryId: editCategoryId,
          executorId: editExecutorId || null,
          dueAt: editDueAt ? new Date(`${editDueAt}T00:00:00.000Z`).toISOString() : null,
          location: editLocation.trim() || null,
        }),
      });
      setEditingOrderId("");
      showToast(t.customer.draftUpdated, "success");
      await loadOrders();
    } catch (error) {
      showToast(errorMessage(error, t.customer.errorSaveDraft));
    } finally {
      setSavingDraftId("");
    }
  }

  async function submitDraft(order: WorkOrder) {
    setSubmittingDraftId(order.id);
    try {
      await apiRequest(`/orders/${encodeURIComponent(order.id)}/submit`, { method: "POST" });
      showToast(
        order.executor
          ? t.customer.toastDraftSentToExecutor
          : t.customer.toastDraftSentForDistribution,
        "success",
      );
      await loadOrders();
    } catch (error) {
      showToast(errorMessage(error, t.customer.errorSubmitDraft));
    } finally {
      setSubmittingDraftId("");
    }
  }

  async function runOrderAction(path: string, body: Record<string, unknown>, success: string) {
    try {
      await apiRequest(path, { method: "POST", body: JSON.stringify(body) });
      showToast(success, "success");
      await loadOrders();
    } catch (error) {
      showToast(errorMessage(error, t.customer.errorAction));
    }
  }

  async function reportInvoicePayment(event: FormEvent<HTMLFormElement>, orderId: string, invoiceId: string) {
    event.preventDefault();
    setReportingInvoiceId(invoiceId);
    try {
      const formData = new FormData(event.currentTarget);
      await apiRequest(
        `/orders/${encodeURIComponent(orderId)}/invoices/${encodeURIComponent(invoiceId)}/payment-reports`,
        { method: "POST", body: formData },
      );
      showToast(t.customer.paymentReportSent, "success");
      await loadOrders();
    } catch (error) {
      showToast(errorMessage(error, t.customer.errorPaymentReport));
    } finally {
      setReportingInvoiceId("");
    }
  }

  return (
    <section className="customer-orders" aria-label={t.customer.aria}>
      <div className="orders-toolbar">
        <div>
          <h2>{t.customer.listTitle}</h2>
          <p>{t.customer.listDescription}</p>
        </div>
        <button
          className="button button-primary"
          type="button"
          onClick={() => {
            setIsCreateOpen((open) => !open);
          }}
          data-testid="create-order"
        >
          {isCreateOpen ? t.customer.closeForm : t.customer.newOrder}
        </button>
      </div>

      {isCreateOpen && (
        <form className="order-form" onSubmit={createOrder} data-testid="create-order-form">
          <div className="order-form-heading">
            <div className="eyebrow">{t.customer.formEyebrow}</div>
            <h2>{t.customer.formTitle}</h2>
            <p>{t.customer.formText}</p>
          </div>
          <label>
            {t.customer.titleLabel}
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={200}
              required
              data-testid="order-title"
            />
          </label>
          <label>
            {t.customer.descriptionLabel}
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={20_000}
              rows={5}
              required
              data-testid="order-description"
            />
          </label>
          <div className="order-form-grid">
            <label>
              {t.customer.categoryLabel}
              <select
                value={categoryId}
                onChange={(event) => setCategoryId(event.target.value)}
                required
                disabled={isLoadingCategories || categories.length === 0}
                data-testid="order-category"
              >
                <option value="" disabled>
                  {isLoadingCategories ? t.customer.loadingCategories : t.customer.chooseCategory}
                </option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>{category.name}</option>
                ))}
              </select>
            </label>
            <label>
              {t.customer.dueLabel}
              <input
                type="date"
                value={dueAt}
                onChange={(event) => setDueAt(event.target.value)}
                data-testid="order-due-date"
              />
            </label>
          </div>
          <label>
            {t.customer.executorLabel} <span className="optional-label">{t.common.optional}</span>
            <select
              value={executorId}
              onChange={(event) => setExecutorId(event.target.value)}
              data-testid="order-executor"
            >
              <option value="">{t.customer.poolOption}</option>
              {executors.map((executor) => (
                <option key={executor.id} value={executor.id}>{executor.name}</option>
              ))}
            </select>
          </label>
          <label>
            {t.customer.locationLabel} <span className="optional-label">{t.common.optional}</span>
            <input
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              maxLength={500}
              data-testid="order-location"
            />
          </label>
          {categoriesError && (
            <button className="button button-quiet" type="button" onClick={() => void loadCategories()} data-testid="retry-categories">
              {t.customer.retryCategories}
            </button>
          )}
          {!isLoadingCategories && !categoriesError && categories.length === 0 && (
            <p className="form-hint" data-testid="no-categories">{t.customer.noCategories}</p>
          )}
          <div className="order-form-actions">
            <button className="button button-quiet" type="button" onClick={() => setIsCreateOpen(false)} data-testid="cancel-create-order">
              {t.common.cancel}
            </button>
            <button
              className="button button-quiet"
              type="submit"
              data-mode="draft"
              disabled={isSubmitting || isLoadingCategories || categories.length === 0}
              data-testid="save-draft"
            >
              {isSubmitting ? t.customer.submittingDraft : t.customer.saveDraft}
            </button>
            <button
              className="button button-primary"
              type="submit"
              data-mode="send"
              disabled={isSubmitting || isLoadingCategories || categories.length === 0}
              data-testid="submit-create-order"
            >
              {isSubmitting ? t.customer.submittingCreate : t.customer.createAndSend}
            </button>
          </div>
        </form>
      )}

      {!isLoadingOrders && !ordersError && orders.length > 0 && (
        <OrderListControls
          filters={orderFilters}
          categories={orderCategories}
          onChange={updateOrderFilters}
          onReset={resetOrderFilters}
        />
      )}

      {ordersError ? (
        <div className="api-load-error" role="group" data-testid="orders-load-error">
          <button className="button button-quiet" type="button" onClick={() => void loadOrders()} data-testid="retry-orders">
            {t.common.retryLoad}
          </button>
        </div>
      ) : isLoadingOrders ? (
        <div className="orders-loading" role="status" data-testid="orders-loading">{t.customer.loadingOrders}</div>
      ) : orders.length === 0 ? (
        <div className="empty-state orders-empty" data-testid="orders-empty-state">
          <span className="empty-state-icon" aria-hidden="true">✳</span>
          <h2>{t.customer.emptyTitle}</h2>
          <p>{t.customer.emptyText}</p>
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="empty-state orders-empty" data-testid="orders-no-results">
          <span className="empty-state-icon" aria-hidden="true">⌕</span>
          <h2>{t.common.nothingFound}</h2>
          <p>{t.common.changeSearch}</p>
          <button
            className="button button-quiet"
            type="button"
            onClick={resetOrderFilters}
            data-testid="orders-reset-filters"
          >
            {t.common.resetFilters}
          </button>
        </div>
      ) : (
        <>
          <div className="orders-list" data-testid="orders-list">
            {visibleOrders.map((order) => {
            const pendingEstimate = order.estimates?.find((estimate) => estimate.status === "PENDING");
            return (
            <article className="order-list-card" key={order.id} data-testid={`order-card-${order.id}`}>
              <div className="order-list-main">
                <div className="order-list-meta">
                  <span>{order.category.name}</span>
                  <span className={`order-status order-status-${order.status.toLowerCase()}`}>
                    {statusLabel(order.status)}
                  </span>
                </div>
                <h3>{order.title}</h3>
                <p>{order.description}</p>
                <Link
                  className="order-detail-link"
                  to={`/customer/orders/${encodeURIComponent(order.id)}`}
                  data-testid={`open-order-${order.id}`}
                >
                  {t.common.openOrder} <span aria-hidden="true">↗</span>
                </Link>
                <div className="order-list-footer">
                  <span>{format(t.common.createdOn, { date: formatDate(order.createdAt) })}</span>
                  {order.executor && <span>{format(t.common.executorName, { name: order.executor.name })}</span>}
                  {order.dueAt && <span>{format(t.common.dueOn, { date: formatDate(order.dueAt) })}</span>}
                  {order.location && <span>{order.location}</span>}
                </div>
                {order.status === "NEW" && (
                  editingOrderId === order.id ? (
                    <form className="order-form draft-edit-form" onSubmit={(event) => void saveDraft(event, order)} data-testid={`edit-order-form-${order.id}`}>
                      <div className="order-form-heading">
                        <div className="eyebrow">{t.customer.draftEyebrow}</div>
                        <h2>{t.customer.editTitle}</h2>
                      </div>
                      <label>
                        {t.customer.titleLabel}
                        <input
                          value={editTitle}
                          onChange={(event) => setEditTitle(event.target.value)}
                          maxLength={200}
                          required
                          data-testid={`edit-title-${order.id}`}
                        />
                      </label>
                      <label>
                        {t.customer.descriptionLabel}
                        <textarea
                          value={editDescription}
                          onChange={(event) => setEditDescription(event.target.value)}
                          maxLength={20_000}
                          rows={4}
                          required
                          data-testid={`edit-description-${order.id}`}
                        />
                      </label>
                      <div className="order-form-grid">
                        <label>
                          {t.customer.categoryLabel}
                          <select
                            value={editCategoryId}
                            onChange={(event) => setEditCategoryId(event.target.value)}
                            required
                            data-testid={`edit-category-${order.id}`}
                          >
                            {categories.map((category) => (
                              <option key={category.id} value={category.id}>{category.name}</option>
                            ))}
                          </select>
                        </label>
                        <label>
                          {t.customer.dueLabel}
                          <input
                            type="date"
                            value={editDueAt}
                            onChange={(event) => setEditDueAt(event.target.value)}
                            data-testid={`edit-due-date-${order.id}`}
                          />
                        </label>
                      </div>
                      <label>
                        {t.customer.executorLabel} <span className="optional-label">{t.common.optional}</span>
                        <select
                          value={editExecutorId}
                          onChange={(event) => setEditExecutorId(event.target.value)}
                          data-testid={`edit-executor-${order.id}`}
                        >
                          <option value="">{t.customer.poolOption}</option>
                          {executors.map((executor) => (
                            <option key={executor.id} value={executor.id}>{executor.name}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        {t.customer.locationLabel} <span className="optional-label">{t.common.optional}</span>
                        <input
                          value={editLocation}
                          onChange={(event) => setEditLocation(event.target.value)}
                          maxLength={500}
                          data-testid={`edit-location-${order.id}`}
                        />
                      </label>
                      <div className="order-form-actions">
                        <button
                          className="button button-quiet"
                          type="button"
                          onClick={() => setEditingOrderId("")}
                          data-testid={`cancel-edit-${order.id}`}
                        >
                          {t.common.cancel}
                        </button>
                        <button
                          className="button button-primary"
                          type="submit"
                          disabled={savingDraftId === order.id}
                          data-testid={`save-draft-${order.id}`}
                        >
                          {savingDraftId === order.id ? t.common.saving : t.customer.saveChanges}
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="customer-order-actions" data-testid={`draft-actions-${order.id}`}>
                      <button
                        className="button button-quiet"
                        type="button"
                        onClick={() => startEditingDraft(order)}
                        data-testid={`edit-order-${order.id}`}
                      >
                        {t.customer.edit}
                      </button>
                      <button
                        className="button button-primary"
                        type="button"
                        disabled={submittingDraftId === order.id}
                        onClick={() => void submitDraft(order)}
                        data-testid={`submit-draft-${order.id}`}
                      >
                        {submittingDraftId === order.id
                          ? t.common.sending
                          : order.executor
                            ? t.customer.sendToExecutor
                            : t.customer.sendForDistribution}
                      </button>
                    </div>
                  )
                )}
                {pendingEstimate && (
                  <div className="customer-order-actions" data-testid={`estimate-response-${order.id}`}>
                    <p className="form-hint">
                      {format(t.customer.estimateLabel, { hours: pendingEstimate.hours, amount: formatAmount(pendingEstimate.amount) })}
                    </p>
                    <button
                      className="button button-primary"
                      type="button"
                      onClick={() => void runOrderAction(
                        `/orders/${encodeURIComponent(order.id)}/estimates/${encodeURIComponent(pendingEstimate.id)}/respond`,
                        { accepted: true },
                        t.toasts.estimateAccepted,
                      )}
                      data-testid={`accept-estimate-${order.id}`}
                    >
                      {t.customer.acceptEstimate}
                    </button>
                    <form
                      className="inline-action-form"
                      onSubmit={(event) => {
                        event.preventDefault();
                        const comment = estimateRejectComments[order.id]?.trim();
                        if (!comment) return;
                        void runOrderAction(
                          `/orders/${encodeURIComponent(order.id)}/estimates/${encodeURIComponent(pendingEstimate.id)}/respond`,
                          { accepted: false, comment },
                          t.toasts.estimateRejected,
                        );
                      }}
                    >
                      <label>
                        {t.customer.rejectReason}
                        <input
                          required
                          maxLength={2000}
                          value={estimateRejectComments[order.id] ?? ""}
                          onChange={(event) => setEstimateRejectComments((values) => ({ ...values, [order.id]: event.target.value }))}
                          data-testid={`estimate-reject-comment-${order.id}`}
                        />
                      </label>
                      <button
                        className="button button-quiet"
                        type="submit"
                        disabled={!estimateRejectComments[order.id]?.trim()}
                        data-testid={`reject-estimate-${order.id}`}
                      >
                        {t.customer.reject}
                      </button>
                    </form>
                  </div>
                )}
                {order.status === "ON_REVIEW" && !order.acceptedAt && (
                  <div className="customer-order-actions" data-testid={`review-response-${order.id}`}>
                    <button
                      className="button button-primary"
                      type="button"
                      onClick={() => void runOrderAction(
                        `/orders/${encodeURIComponent(order.id)}/accept`,
                        {},
                        t.toasts.workAccepted,
                      )}
                      data-testid={`accept-work-${order.id}`}
                    >
                      {t.customer.acceptWork}
                    </button>
                    <form
                      className="inline-action-form"
                      onSubmit={(event) => {
                        event.preventDefault();
                        const comment = revisionComments[order.id]?.trim();
                        if (!comment) return;
                        void runOrderAction(
                          `/orders/${encodeURIComponent(order.id)}/request-revision`,
                          { comment },
                          t.toasts.revisionRequested,
                        );
                      }}
                    >
                      <label>
                        {t.customer.revisionLabel}
                        <input
                          required
                          maxLength={2000}
                          value={revisionComments[order.id] ?? ""}
                          onChange={(event) => setRevisionComments((values) => ({ ...values, [order.id]: event.target.value }))}
                          data-testid={`revision-comment-${order.id}`}
                        />
                      </label>
                      <button className="button button-quiet" type="submit" data-testid={`request-revision-${order.id}`}>
                        {t.customer.requestRevision}
                      </button>
                    </form>
                  </div>
                )}
                {order.invoices?.map((invoice) => {
                  const latestReport = invoice.paymentReports?.[0];
                  const canReportPayment = invoice.status === "ISSUED" && latestReport?.status !== "PENDING";
                  return (
                    <div className="invoice-payment" key={invoice.id} data-testid={`invoice-payment-${invoice.id}`}>
                      <p className="form-hint">
                        {format(t.common.invoiceLine, {
                          number: invoice.number,
                          amount: formatAmount(invoice.amount),
                          status: invoiceStatusLabel(invoice.status),
                        })}
                      </p>
                      {latestReport?.status === "PENDING" && <p className="form-hint">{t.customer.receiptPending}</p>}
                      {latestReport?.status === "CONFIRMED" && <p className="form-hint">{t.customer.paymentConfirmed}</p>}
                      {latestReport?.status === "REJECTED" && (
                        <p className="payment-rejected-note">
                          {format(t.customer.paymentRejected, { comment: latestReport.reviewComment ?? "" })}
                        </p>
                      )}
                      {canReportPayment && (
                        <form
                          className="payment-report-form"
                          onSubmit={(event) => void reportInvoicePayment(event, order.id, invoice.id)}
                        >
                          <label>
                            {t.customer.paymentLabel}
                            <input
                              type="file"
                              name="file"
                              required
                              data-testid={`payment-receipt-${invoice.id}`}
                            />
                          </label>
                          <button
                            className="button button-primary"
                            type="submit"
                            disabled={reportingInvoiceId === invoice.id}
                            data-testid={`report-payment-${invoice.id}`}
                          >
                            {reportingInvoiceId === invoice.id ? t.common.sending : t.customer.reportPayment}
                          </button>
                        </form>
                      )}
                    </div>
                  );
                })}
              </div>
              <span className="order-card-arrow" aria-hidden="true">↗</span>
            </article>
            );
            })}
          </div>
          <OrderPagination
            page={currentPage}
            total={filteredOrders.length}
            totalPages={totalPages}
            onPageChange={setOrdersPage}
          />
        </>
      )}
    </section>
  );
}

function LoadingPage() {
  const { t } = useI18n();
  return <main className="loading-page" role="status" data-testid="auth-loading">{t.loadingPage}</main>;
}

function NotFoundPage() {
  const { t } = useI18n();
  return (
    <main className="not-found-page" data-testid="not-found-page">
      <LanguageSwitcher />
      <span className="brand-mark" aria-hidden="true">д</span>
      <div className="eyebrow">{t.notFound.eyebrow}</div>
      <h1>{t.notFound.title}</h1>
      <Link className="button button-primary" to="/" data-testid="not-found-home">{t.notFound.home}</Link>
    </main>
  );
}

function getRole(user: object): Role | undefined {
  if (!("role" in user)) return undefined;
  const role = user.role;
  return role === "CUSTOMER" || role === "EXECUTOR" || role === "ADMIN" ? role : undefined;
}

function decodeRouteSegment(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}
