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
import { apiRequest, getUserFacingError } from "./api";
import { AdminCategoriesPage } from "./admin-pages";
import { AdminOrdersPage, ExecutorOrdersPage } from "./role-order-panels";
import { OrderDetailView } from "./order-detail";
import { ToastProvider, useToast } from "./toast";

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
  dueAt?: string;
  location?: string;
};

const orderStatusLabels: Record<string, string> = {
  NEW: "Черновик",
  WAITING_DISTRIBUTION: "Ждёт распределения",
  ASSIGNED: "Назначена",
  IN_PROGRESS: "В работе",
  ON_REVIEW: "На проверке",
  NEEDS_REVISION: "Нужны исправления",
  INVOICE_ISSUED: "Выставлен счёт",
  INVOICE_PAID: "Счёт оплачен",
  COMPLETED: "Завершена",
  CANCELLED: "Отменена",
};

const panels: Record<Role, { path: string; label: string; title: string; description: string }> = {
  CUSTOMER: {
    path: "/customer",
    label: "Заказчик",
    title: "Ваши заказы",
    description: "Создавайте заказы и следите за ходом работ в одном месте.",
  },
  EXECUTOR: {
    path: "/executor",
    label: "Исполнитель",
    title: "Рабочий стол",
    description: "Находите новые задачи и ведите работу по назначенным заказам.",
  },
  ADMIN: {
    path: "/admin",
    label: "Администратор",
    title: "Управление заказами",
    description: "Распределяйте заказы, управляйте командой и выставляйте счета.",
  },
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

  return (
    <main className="landing" data-testid="landing-page">
      <header className="topbar wrap">
        <Link className="brand" to="/" aria-label="Дело — на главную" data-testid="brand-home">
          <span className="brand-mark" aria-hidden="true">д</span>
          <span>дело<span className="brand-period">.</span></span>
        </Link>
        <nav className="topnav" aria-label="Главная навигация">
          <a href="#how-it-works" data-testid="nav-how-it-works">Как это работает</a>
          <a href="#for-whom" data-testid="nav-for-whom">Для кого</a>
          {!isPending && role ? (
            <Link className="button button-dark button-small" to={panels[role].path} data-testid="nav-dashboard">
              В мой кабинет
            </Link>
          ) : (
            <Link className="button button-dark button-small" to="/login" data-testid="nav-login">
              Войти
            </Link>
          )}
        </nav>
      </header>

      <section className="hero wrap">
        <div className="hero-copy">
          <div className="eyebrow"><span className="eyebrow-dot" /> Работа начинается с ясности</div>
          <h1>Все задачи.<br /><span>В одном деле.</span></h1>
          <p className="hero-text">
            Создавайте заказы, находите исполнителей и держите весь процесс под контролем —
            от первого описания до готового результата.
          </p>
          <div className="hero-actions">
            <Link className="button button-primary" to={role ? panels[role].path : "/register"} data-testid="hero-register">
              {role === "CUSTOMER" ? "Перейти к заказам" : role ? "Открыть кабинет" : "Создать заказ"} <span aria-hidden="true">↗</span>
            </Link>
            <Link className="button button-quiet" to="/login" data-testid="hero-login">
              Уже есть аккаунт? <span>Войти</span>
            </Link>
          </div>
          <div className="hero-note">
            <span className="avatar-stack" aria-hidden="true"><i>А</i><i>М</i><i>К</i></span>
            <span>Заказ, команда и результат — ничего не теряется</span>
          </div>
        </div>

        <div className="hero-visual" role="img" aria-label="Пример рабочего пространства">
          <div className="visual-glow" />
          <div className="task-card task-card-main">
            <div className="task-card-top">
              <span className="task-icon" aria-hidden="true">✳</span>
              <span className="task-status"><i /> В работе</span>
              <span className="more-dots" aria-hidden="true">···</span>
            </div>
            <span className="task-category">ДИЗАЙН · ЗАКАЗ #024</span>
            <h2>Обновить презентацию<br />для нового продукта</h2>
            <p className="task-subtitle">12 слайдов · дедлайн 24 октября</p>
            <div className="task-divider" />
            <div className="task-footer">
              <div className="task-person"><span className="person-avatar">МК</span><span><b>Мария К.</b><small>Исполнитель</small></span></div>
              <div className="progress-ring"><span>68<small>%</small></span></div>
            </div>
          </div>
          <div className="floating-note">
            <span className="note-check">✓</span>
            <span><b>Этап завершён</b><small>Можно переходить дальше</small></span>
          </div>
          <div className="visual-caption"><span /> Всё важное — в карточке заказа</div>
        </div>
      </section>

      <section className="process-section" id="how-it-works">
        <div className="wrap">
          <div className="section-heading">
            <div><div className="eyebrow">ПРОСТОЙ ПРОЦЕСС</div><h2>От задачи до результата</h2></div>
            <p>Понятный маршрут помогает заказчику и исполнителю работать слаженно.</p>
          </div>
          <div className="steps-grid">
            <Step number="01" title="Опишите задачу" text="Добавьте описание, категорию и желаемый срок. Все детали останутся в заказе." />
            <Step number="02" title="Договоритесь о работе" text="Исполнитель предложит оценку, а вы согласуете объём до начала работы." />
            <Step number="03" title="Примите результат" text="Обсудите ход работы, проверьте результат и завершите заказ." />
          </div>
        </div>
      </section>

      <section className="audience-section wrap" id="for-whom">
        <div className="audience-copy">
          <div className="eyebrow">ОДНА ДОСКА — ОБЩИЙ ПРОЦЕСС</div>
          <h2>Каждый знает,<br />что делать дальше.</h2>
          <p>Заказчики, исполнители и администраторы видят только нужные им действия, а история работы остаётся рядом с заказом.</p>
          <Link className="text-link" to="/register" data-testid="audience-register">Начать работу <span aria-hidden="true">→</span></Link>
        </div>
        <div className="roles-list">
          <RoleRow mark="З" title="Заказчику" text="Создавать заказы и принимать результат" />
          <RoleRow mark="И" title="Исполнителю" text="Выбирать задачи и вести свою работу" />
          <RoleRow mark="А" title="Администратору" text="Распределять заказы и управлять процессом" />
        </div>
      </section>

      <footer className="footer">
        <div className="wrap footer-inner">
          <Link className="brand" to="/" data-testid="footer-brand"><span className="brand-mark" aria-hidden="true">д</span><span>дело<span className="brand-period">.</span></span></Link>
          <span>Пространство для работы, которая движется вперёд.</span>
          <Link to="/login" data-testid="footer-login">Войти в кабинет <span aria-hidden="true">↗</span></Link>
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

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    try {
      const result = isRegister
        ? await authClient.signUp.email({ name: name.trim(), email: email.trim(), password })
        : await authClient.signIn.email({ email: email.trim(), password });
      if (result.error) {
        showToast(isRegister
          ? "Не удалось создать аккаунт. Проверьте данные: возможно, этот адрес уже зарегистрирован."
          : "Не удалось войти. Проверьте электронную почту и пароль.");
        return;
      }

      const sessionResult = await authClient.getSession();
      if (!sessionResult.data) {
        showToast("Не удалось получить активную сессию. Попробуйте войти снова.");
        return;
      }
      const role = getRole(sessionResult.data.user);
      if (!role) {
        showToast("Для аккаунта не назначена роль. Обратитесь к администратору.");
        return;
      }
      const requestedPath = (location.state as { from?: unknown } | null)?.from;
      const panelPath = panels[role].path;
      const destination =
        typeof requestedPath === "string" &&
        (requestedPath === panelPath || requestedPath.startsWith(`${panelPath}/`))
          ? requestedPath
          : panelPath;
      navigate(destination, { replace: true });
    } catch (submitError) {
      showToast(getUserFacingError(
        submitError,
        "Не удалось выполнить вход. Проверьте данные и попробуйте снова.",
      ));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="auth-page" data-testid={isRegister ? "register-page" : "login-page"}>
      <Link className="brand auth-brand" to="/" data-testid="auth-brand"><span className="brand-mark" aria-hidden="true">д</span><span>дело<span className="brand-period">.</span></span></Link>
      <section className="auth-card">
        <Link className="back-link" to="/" data-testid="auth-back">← На главную</Link>
        <div className="eyebrow">{isRegister ? "НАЧНИТЕ РАБОТУ" : "С ВОЗВРАЩЕНИЕМ"}</div>
        <h1>{isRegister ? "Создать аккаунт" : "Войти в кабинет"}</h1>
        <p className="auth-description">{isRegister ? "Зарегистрируйтесь как заказчик, чтобы создавать и отслеживать заказы." : "Введите данные аккаунта, чтобы продолжить работу."}</p>
        <form className="auth-form" onSubmit={submit} data-testid="auth-form">
          {isRegister && (
            <label>
              Имя
              <input autoComplete="name" name="name" value={name} onChange={(event) => setName(event.target.value)} required minLength={2} data-testid="auth-name" />
            </label>
          )}
          <label>
            Электронная почта
            <input autoComplete="email" name="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required data-testid="auth-email" />
          </label>
          <label>
            Пароль
            <input autoComplete={isRegister ? "new-password" : "current-password"} name="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} data-testid="auth-password" />
          </label>
          <button className="button button-primary auth-submit" type="submit" disabled={isSubmitting} data-testid="auth-submit">
            {isSubmitting ? "Подождите…" : isRegister ? "Создать аккаунт" : "Войти"}
          </button>
        </form>
        <p className="auth-switch">
          {isRegister ? "Уже зарегистрированы?" : "Нет аккаунта?"}{" "}
          <Link to={isRegister ? "/login" : "/register"} state={location.state} data-testid="auth-switch">
            {isRegister ? "Войти" : "Создать аккаунт"}
          </Link>
        </p>
      </section>
      <p className="auth-footer">Дело — работа начинается с ясности.</p>
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
    return <Navigate to={userRole ? panels[userRole].path : "/"} replace />;
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
  const panel = panels[role];
  const location = useLocation();
  const navigate = useNavigate();
  const relativePath = location.pathname.slice(panel.path.length).replace(/\/+$/u, "") || "/";
  const isProfile = relativePath === "/profile";
  const isCategories = role === "ADMIN" && relativePath === "/categories";
  const isOrders = !isProfile && !isCategories;
  const orderMatch = location.pathname.match(new RegExp(`^${panel.path}/orders/([^/]+)$`, "u"));
  const orderId = orderMatch ? decodeRouteSegment(orderMatch[1]) : null;
  const [userName, setUserName] = useState(user.name);
  const [userEmail, setUserEmail] = useState(user.email);
  useEffect(() => setUserName(user.name), [user.name]);
  useEffect(() => setUserEmail(user.email), [user.email]);
  const title = isProfile ? "Профиль" : isCategories ? "Категории" : panel.title;
  const eyebrow = isProfile ? "ВАШ АККАУНТ" : isCategories ? "УПРАВЛЕНИЕ" : "РАБОЧЕЕ ПРОСТРАНСТВО";
  const description = isProfile
    ? "Основные данные и параметры учётной записи."
    : isCategories
      ? "Создавайте направления работ и управляйте их доступностью."
      : panel.description;
  const [isSigningOut, setIsSigningOut] = useState(false);
  const { showToast } = useToast();

  async function signOut() {
    setIsSigningOut(true);
    try {
      const result = await authClient.signOut();
      if (result.error) {
        showToast(getUserFacingError(result.error, "Не удалось завершить сеанс."));
        return;
      }
      navigate("/", { replace: true });
    } catch (error) {
      showToast(getUserFacingError(error, "Не удалось завершить сеанс."));
    } finally {
      setIsSigningOut(false);
    }
  }

  return (
    <main className="panel-page" data-testid={`${role.toLowerCase()}-panel`}>
      <aside className="panel-sidebar">
        <Link className="brand" to="/" data-testid="panel-brand"><span className="brand-mark" aria-hidden="true">д</span><span>дело<span className="brand-period">.</span></span></Link>
        <div className="panel-role-label">{panel.label.toUpperCase()}</div>
        <nav className="panel-nav" aria-label="Навигация панели">
          <Link className={`panel-nav-item${isOrders ? " active" : ""}`} to={panel.path} data-testid="panel-orders-link"><span aria-hidden="true">▦</span>Заказы</Link>
          {role === "ADMIN" && (
            <Link className={`panel-nav-item${isCategories ? " active" : ""}`} to={`${panel.path}/categories`} data-testid="panel-categories-link"><span aria-hidden="true">▤</span>Категории</Link>
          )}
          <Link className={`panel-nav-item${isProfile ? " active" : ""}`} to={`${panel.path}/profile`} data-testid="panel-profile-link"><span aria-hidden="true">◉</span>Профиль</Link>
        </nav>
        <div className="sidebar-bottom">
          <div className="user-chip"><span className="user-avatar">{userName.slice(0, 1).toUpperCase()}</span><span><b>{userName}</b><small>{panel.label}</small></span></div>
          <button className="signout-button" onClick={signOut} disabled={isSigningOut} data-testid="sign-out">
            {isSigningOut ? "Выходим…" : "Выйти"}
          </button>
        </div>
      </aside>
      <section className="panel-content">
        <header className="panel-topbar"><span>{panel.label}</span><span className="online-indicator"><i /> Рабочее пространство</span></header>
        <div className="panel-inner">
          <div className="panel-heading">
            <div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>
          </div>
          {role === "ADMIN" && isCategories ? (
            <AdminCategoriesPage />
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
        if (!cancelled) showToast(getUserFacingError(error, "Не удалось загрузить ставку."));
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
      showToast("Изменений нет.");
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
      showToast("Данные профиля обновлены.", "success");
    } catch (error) {
      showToast(getUserFacingError(error, "Не удалось обновить профиль."));
    } finally {
      setIsSavingProfile(false);
    }
  }

  async function saveHourlyRate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const rate = Number(hourlyRate);
    if (!Number.isFinite(rate) || rate <= 0) {
      showToast("Укажите положительную ставку.");
      return;
    }

    setIsSavingRate(true);
    try {
      const updated = await apiRequest<{ hourlyRate: number | string }>("/users/me/hourly-rate", {
        method: "PATCH",
        body: JSON.stringify({ hourlyRate: rate }),
      });
      setHourlyRate(String(updated.hourlyRate));
      showToast("Почасовая ставка обновлена.", "success");
    } catch (error) {
      showToast(getUserFacingError(error, "Не удалось сохранить ставку."));
    } finally {
      setIsSavingRate(false);
    }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (newPassword !== confirmPassword) {
      showToast("Новый пароль и подтверждение не совпадают.");
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
        showToast(getUserFacingError(result.error, "Не удалось изменить пароль. Проверьте текущий пароль."));
        return;
      }
      setPasswordCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      showToast("Пароль изменён. Другие активные сеансы завершены.", "success");
    } catch (error) {
      showToast(getUserFacingError(error, "Не удалось изменить пароль. Проверьте текущий пароль."));
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
            <h2>Данные аккаунта</h2>
            <p>Изменения имени и почты подтвердите текущим паролем.</p>
          </div>
        </div>
        <form className="profile-form" onSubmit={saveProfile} data-testid="profile-form">
          <label>
            Имя
            <input value={name} onChange={(event) => setName(event.target.value)} minLength={1} maxLength={120} required data-testid="profile-name" />
          </label>
          <label>
            Электронная почта
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={254} required data-testid="profile-email" />
          </label>
          <label>
            Текущий пароль
            <input type="password" value={profileCurrentPassword} onChange={(event) => setProfileCurrentPassword(event.target.value)} autoComplete="current-password" minLength={1} required data-testid="profile-current-password" />
          </label>
          <p className="profile-help">При смене адреса он применяется сразу. Подтверждение почты в приложении пока не требуется.</p>
          <button className="button button-primary" type="submit" disabled={isSavingProfile || !profileCurrentPassword} data-testid="save-profile">
            {isSavingProfile ? "Сохраняем…" : "Сохранить данные"}
          </button>
        </form>
      </article>
      {user.role === "EXECUTOR" && (
        <article className="profile-card" data-testid="executor-rate-card">
          <div className="profile-card-heading">
            <span className="profile-avatar profile-avatar-rate" aria-hidden="true">$</span>
            <div>
              <h2>Почасовая ставка</h2>
              <p>Используется при расчёте новых оценок по назначенным вам заказам.</p>
            </div>
          </div>
          <form className="profile-form" onSubmit={saveHourlyRate} data-testid="hourly-rate-form">
            <label>
              Ставка, USD в час
              <input
                type="number"
                min="0.0001"
                max="1000000"
                step="0.0001"
                required
                placeholder="Например, 45"
                value={hourlyRate}
                onChange={(event) => setHourlyRate(event.target.value)}
                disabled={isLoadingRate || isSavingRate}
                data-testid="profile-hourly-rate"
              />
            </label>
            <p className="profile-help">Уже предложенные оценки и выставленные счета сохраняют прежнюю ставку.</p>
            <button
              className="button button-primary"
              type="submit"
              disabled={isLoadingRate || isSavingRate || !hourlyRate}
              data-testid="save-hourly-rate"
            >
              {isLoadingRate ? "Загружаем…" : isSavingRate ? "Сохраняем…" : "Сохранить ставку"}
            </button>
          </form>
        </article>
      )}
      <article className="profile-card">
        <div className="profile-card-heading">
          <span className="profile-avatar profile-avatar-password" aria-hidden="true">⌑</span>
          <div>
            <h2>Изменить пароль</h2>
            <p>После смены пароля остальные сеансы будут завершены.</p>
          </div>
        </div>
        <form className="profile-form" onSubmit={changePassword} data-testid="password-change-form">
          <label>
            Текущий пароль
            <input type="password" value={passwordCurrentPassword} onChange={(event) => setPasswordCurrentPassword(event.target.value)} autoComplete="current-password" minLength={1} required data-testid="password-current" />
          </label>
          <label>
            Новый пароль
            <input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" minLength={8} maxLength={128} required data-testid="password-new" />
          </label>
          <label>
            Повторите новый пароль
            <input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" minLength={8} maxLength={128} required data-testid="password-confirm" />
          </label>
          <button className="button button-primary" type="submit" disabled={isChangingPassword || !passwordCurrentPassword} data-testid="change-password">
            {isChangingPassword ? "Меняем пароль…" : "Изменить пароль"}
          </button>
        </form>
      </article>
      <div className="profile-role-note" data-testid="profile-role">
        <span>Роль аккаунта</span>
        <b>{panels[user.role].label}</b>
        <small>Роль назначается администратором и не изменяется из профиля.</small>
      </div>
    </section>
  );
}

function CustomerOrdersPage() {
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState(true);
  const [isLoadingCategories, setIsLoadingCategories] = useState(true);
  const [ordersError, setOrdersError] = useState(false);
  const [categoriesError, setCategoriesError] = useState(false);
  const [revisionComments, setRevisionComments] = useState<Record<string, string>>({});
  const [reportingInvoiceId, setReportingInvoiceId] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [location, setLocation] = useState("");
  const { showToast } = useToast();

  const loadOrders = useCallback(async () => {
    setIsLoadingOrders(true);
    setOrdersError(false);
    try {
      setOrders(await apiRequest<WorkOrder[]>("/orders"));
    } catch (error) {
      setOrdersError(true);
      showToast(getUserFacingError(error, "Не удалось загрузить заказы."));
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
      showToast(getUserFacingError(error, "Не удалось загрузить категории."));
    } finally {
      setIsLoadingCategories(false);
    }
  }, [showToast]);

  useEffect(() => {
    void Promise.all([loadOrders(), loadCategories()]);
  }, [loadOrders, loadCategories]);

  async function createOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);

    try {
      const input: CreateOrderInput = {
        title: title.trim(),
        description: description.trim(),
        categoryId,
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
      setDueAt("");
      setLocation("");

      try {
        await apiRequest<WorkOrder>(`/orders/${encodeURIComponent(draft.id)}/submit`, {
          method: "POST",
        });
        showToast("Заказ создан и отправлен на распределение.", "success");
      } catch (error) {
        showToast(
          `Черновик создан, но отправить его не удалось. ${getUserFacingError(error, "Попробуйте отправить его позже.")}`,
        );
      }

      await loadOrders();
    } catch (error) {
      showToast(getUserFacingError(error, "Не удалось создать заказ."));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function runOrderAction(path: string, body: Record<string, unknown>, success: string) {
    try {
      await apiRequest(path, { method: "POST", body: JSON.stringify(body) });
      showToast(success, "success");
      await loadOrders();
    } catch (error) {
      showToast(getUserFacingError(error, "Не удалось выполнить действие."));
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
      showToast("Подтверждение оплаты отправлено администратору на проверку.", "success");
      await loadOrders();
    } catch (error) {
      showToast(getUserFacingError(error, "Не удалось отправить подтверждение оплаты."));
    } finally {
      setReportingInvoiceId("");
    }
  }

  return (
    <section className="customer-orders" aria-label="Заказы заказчика">
      <div className="orders-toolbar">
        <div>
          <h2>Список заказов</h2>
          <p>Ваши текущие и завершённые работы</p>
        </div>
        <button
          className="button button-primary"
          type="button"
          onClick={() => {
            setIsCreateOpen((open) => !open);
          }}
          data-testid="create-order"
        >
          {isCreateOpen ? "Закрыть форму" : "+ Новый заказ"}
        </button>
      </div>

      {isCreateOpen && (
        <form className="order-form" onSubmit={createOrder} data-testid="create-order-form">
          <div className="order-form-heading">
            <div className="eyebrow">НОВЫЙ ЗАПРОС</div>
            <h2>Опишите, что нужно сделать</h2>
            <p>После создания заказ сразу станет доступен для распределения.</p>
          </div>
          <label>
            Название
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={200}
              required
              data-testid="order-title"
            />
          </label>
          <label>
            Описание задачи
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
              Категория
              <select
                value={categoryId}
                onChange={(event) => setCategoryId(event.target.value)}
                required
                disabled={isLoadingCategories || categories.length === 0}
                data-testid="order-category"
              >
                <option value="" disabled>
                  {isLoadingCategories ? "Загрузка категорий…" : "Выберите категорию"}
                </option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>{category.name}</option>
                ))}
              </select>
            </label>
            <label>
              Желаемый срок
              <input
                type="date"
                value={dueAt}
                onChange={(event) => setDueAt(event.target.value)}
                data-testid="order-due-date"
              />
            </label>
          </div>
          <label>
            Место выполнения <span className="optional-label">необязательно</span>
            <input
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              maxLength={500}
              data-testid="order-location"
            />
          </label>
          {categoriesError && (
            <button className="button button-quiet" type="button" onClick={() => void loadCategories()} data-testid="retry-categories">
              Повторить загрузку категорий
            </button>
          )}
          {!isLoadingCategories && !categoriesError && categories.length === 0 && (
            <p className="form-hint" data-testid="no-categories">Пока нет доступных категорий. Обратитесь к администратору.</p>
          )}
          <div className="order-form-actions">
            <button className="button button-quiet" type="button" onClick={() => setIsCreateOpen(false)} data-testid="cancel-create-order">
              Отмена
            </button>
            <button
              className="button button-primary"
              type="submit"
              disabled={isSubmitting || isLoadingCategories || categories.length === 0}
              data-testid="submit-create-order"
            >
              {isSubmitting ? "Создаём…" : "Создать и отправить"}
            </button>
          </div>
        </form>
      )}

      {ordersError ? (
        <div className="api-load-error" role="group" data-testid="orders-load-error">
          <button className="button button-quiet" type="button" onClick={() => void loadOrders()} data-testid="retry-orders">
            Повторить загрузку
          </button>
        </div>
      ) : isLoadingOrders ? (
        <div className="orders-loading" role="status" data-testid="orders-loading">Загружаем заказы…</div>
      ) : orders.length === 0 ? (
        <div className="empty-state orders-empty" data-testid="orders-empty-state">
          <span className="empty-state-icon" aria-hidden="true">✳</span>
          <h2>Заказов пока нет</h2>
          <p>Создайте первый заказ — он появится здесь и станет доступен для распределения.</p>
        </div>
      ) : (
        <div className="orders-list" data-testid="orders-list">
          {orders.map((order) => {
            const pendingEstimate = order.estimates?.find((estimate) => estimate.status === "PENDING");
            return (
            <article className="order-list-card" key={order.id} data-testid={`order-card-${order.id}`}>
              <div className="order-list-main">
                <div className="order-list-meta">
                  <span>{order.category.name}</span>
                  <span className={`order-status order-status-${order.status.toLowerCase()}`}>
                    {orderStatusLabels[order.status] ?? order.status}
                  </span>
                </div>
                <h3>{order.title}</h3>
                <p>{order.description}</p>
                <Link
                  className="order-detail-link"
                  to={`/customer/orders/${encodeURIComponent(order.id)}`}
                  data-testid={`open-order-${order.id}`}
                >
                  Открыть карточку заказа <span aria-hidden="true">↗</span>
                </Link>
                <div className="order-list-footer">
                  <span>Создан {formatDate(order.createdAt)}</span>
                  {order.dueAt && <span>Срок {formatDate(order.dueAt)}</span>}
                  {order.location && <span>{order.location}</span>}
                </div>
                {pendingEstimate && (
                  <div className="customer-order-actions" data-testid={`estimate-response-${order.id}`}>
                    <p className="form-hint">
                      Оценка исполнителя: {pendingEstimate.hours} ч · {new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(Number(pendingEstimate.amount))}
                    </p>
                    <button
                      className="button button-primary"
                      type="button"
                      onClick={() => void runOrderAction(
                        `/orders/${encodeURIComponent(order.id)}/estimates/${encodeURIComponent(pendingEstimate.id)}/respond`,
                        { accepted: true },
                        "Оценка принята, исполнитель может начинать работу.",
                      )}
                      data-testid={`accept-estimate-${order.id}`}
                    >
                      Принять оценку
                    </button>
                    <button
                      className="button button-quiet"
                      type="button"
                      onClick={() => void runOrderAction(
                        `/orders/${encodeURIComponent(order.id)}/estimates/${encodeURIComponent(pendingEstimate.id)}/respond`,
                        { accepted: false },
                        "Оценка отклонена, заказ возвращён в пул.",
                      )}
                      data-testid={`reject-estimate-${order.id}`}
                    >
                      Отклонить
                    </button>
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
                        "Работа принята. Администратор сможет выставить счёт.",
                      )}
                      data-testid={`accept-work-${order.id}`}
                    >
                      Принять работу
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
                          "Заказ возвращён исполнителю на исправление.",
                        );
                      }}
                    >
                      <label>
                        Что нужно исправить
                        <input
                          required
                          maxLength={2000}
                          value={revisionComments[order.id] ?? ""}
                          onChange={(event) => setRevisionComments((values) => ({ ...values, [order.id]: event.target.value }))}
                          data-testid={`revision-comment-${order.id}`}
                        />
                      </label>
                      <button className="button button-quiet" type="submit" data-testid={`request-revision-${order.id}`}>
                        Запросить исправления
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
                        Счёт {invoice.number}: {new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(Number(invoice.amount))} · {invoice.status === "ISSUED" ? "ожидает оплаты" : invoice.status === "PAID" ? "оплачен" : "аннулирован"}
                      </p>
                      {latestReport?.status === "PENDING" && <p className="form-hint">Чек отправлен администратору, ожидает проверки.</p>}
                      {latestReport?.status === "CONFIRMED" && <p className="form-hint">Оплата подтверждена администратором.</p>}
                      {latestReport?.status === "REJECTED" && (
                        <p className="payment-rejected-note">
                          Подтверждение отклонено: {latestReport.reviewComment}. Можно отправить новый чек.
                        </p>
                      )}
                      {canReportPayment && (
                        <form
                          className="payment-report-form"
                          onSubmit={(event) => void reportInvoicePayment(event, order.id, invoice.id)}
                        >
                          <label>
                            Я оплатил счёт — приложите чек или квитанцию (не более 1 MB)
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
                            {reportingInvoiceId === invoice.id ? "Отправляем…" : "Сообщить об оплате"}
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
      )}
    </section>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(value));
}

function LoadingPage() {
  return <main className="loading-page" role="status" data-testid="auth-loading">Загружаем рабочее пространство…</main>;
}

function NotFoundPage() {
  return (
    <main className="not-found-page" data-testid="not-found-page">
      <span className="brand-mark" aria-hidden="true">д</span>
      <div className="eyebrow">СТРАНИЦА НЕ НАЙДЕНА</div>
      <h1>Кажется, здесь пока пусто.</h1>
      <Link className="button button-primary" to="/" data-testid="not-found-home">На главную</Link>
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
