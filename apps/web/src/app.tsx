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
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<AuthPage mode="login" />} />
        <Route path="/register" element={<AuthPage mode="register" />} />
        <Route path="/customer/*" element={<PanelRoute role="CUSTOMER" />} />
        <Route path="/executor/*" element={<PanelRoute role="EXECUTOR" />} />
        <Route path="/admin/*" element={<PanelRoute role="ADMIN" />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
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
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);
    try {
      const result = isRegister
        ? await authClient.signUp.email({ name: name.trim(), email: email.trim(), password })
        : await authClient.signIn.email({ email: email.trim(), password });
      if (result.error) {
        setError(result.error.message ?? "Не удалось выполнить вход. Проверьте данные и попробуйте ещё раз.");
        return;
      }

      const sessionResult = await authClient.getSession();
      if (!sessionResult.data) throw new Error("Не удалось получить активную сессию.");
      const role = getRole(sessionResult.data.user);
      if (!role) throw new Error("Для аккаунта не назначена роль. Обратитесь к администратору.");
      const requestedPath = (location.state as { from?: unknown } | null)?.from;
      const panelPath = panels[role].path;
      const destination =
        typeof requestedPath === "string" &&
        (requestedPath === panelPath || requestedPath.startsWith(`${panelPath}/`))
          ? requestedPath
          : panelPath;
      navigate(destination, { replace: true });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Произошла ошибка. Попробуйте ещё раз.");
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
          {error && <p className="form-error" role="alert" data-testid="auth-error">{error}</p>}
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

  return <PanelPage role={role} userName={session.user.name} />;
}

function PanelPage({ role, userName }: { role: Role; userName: string }) {
  const panel = panels[role];
  const location = useLocation();
  const navigate = useNavigate();
  const isProfile = location.pathname.endsWith("/profile");
  const title = isProfile ? "Профиль" : panel.title;
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState("");

  async function signOut() {
    setIsSigningOut(true);
    setSignOutError("");
    try {
      await authClient.signOut();
      navigate("/", { replace: true });
    } catch (error) {
      setSignOutError(error instanceof Error ? error.message : "Не удалось завершить сеанс.");
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
          <Link className={`panel-nav-item${isProfile ? "" : " active"}`} to={panel.path} data-testid="panel-orders-link"><span aria-hidden="true">▦</span>Заказы</Link>
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
          {signOutError && <p className="form-error" role="alert" data-testid="sign-out-error">{signOutError}</p>}
          <div className="panel-heading">
            <div><div className="eyebrow">{isProfile ? "ВАШ АККАУНТ" : "РАБОЧЕЕ ПРОСТРАНСТВО"}</div><h1>{title}</h1><p>{isProfile ? "Основные данные и параметры учётной записи." : panel.description}</p></div>
          </div>
          {role === "CUSTOMER" && !isProfile ? (
            <CustomerOrdersPage />
          ) : (
            <div className="empty-state" data-testid={isProfile ? "profile-placeholder" : "orders-empty-state"}>
              <span className="empty-state-icon" aria-hidden="true">{isProfile ? userName.slice(0, 1).toUpperCase() : "✳"}</span>
              <h2>{isProfile ? `Здравствуйте, ${userName}` : "Рабочий стол готовится"}</h2>
              <p>{isProfile ? "Управление данными профиля появится на следующем этапе разработки." : "Подключение списков заказов и действий для этой роли — следующий этап разработки."}</p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

function CustomerOrdersPage() {
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState(true);
  const [isLoadingCategories, setIsLoadingCategories] = useState(true);
  const [ordersError, setOrdersError] = useState("");
  const [categoriesError, setCategoriesError] = useState("");
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [location, setLocation] = useState("");

  const loadOrders = useCallback(async () => {
    setIsLoadingOrders(true);
    setOrdersError("");
    try {
      setOrders(await apiRequest<WorkOrder[]>("/orders"));
    } catch (error) {
      setOrdersError(getRequestError(error, "Не удалось загрузить заказы."));
    } finally {
      setIsLoadingOrders(false);
    }
  }, []);

  const loadCategories = useCallback(async () => {
    setIsLoadingCategories(true);
    setCategoriesError("");
    try {
      const availableCategories = await apiRequest<Category[]>("/categories");
      setCategories(availableCategories);
      setCategoryId((current) => current || availableCategories[0]?.id || "");
    } catch (error) {
      setCategoriesError(getRequestError(error, "Не удалось загрузить категории."));
    } finally {
      setIsLoadingCategories(false);
    }
  }, []);

  useEffect(() => {
    void Promise.all([loadOrders(), loadCategories()]);
  }, [loadOrders, loadCategories]);

  async function createOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActionError("");
    setNotice("");
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
        setNotice("Заказ создан и отправлен на распределение.");
      } catch (error) {
        setActionError(`Черновик создан, но отправить его не удалось: ${getRequestError(error, "ошибка API")}`);
      }

      await loadOrders();
    } catch (error) {
      setActionError(getRequestError(error, "Не удалось создать заказ."));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="customer-orders" aria-label="Заказы заказчика">
      {actionError && <p className="form-error api-message" role="alert" data-testid="customer-orders-error">{actionError}</p>}
      {notice && <p className="success-message" role="status" data-testid="customer-orders-notice">{notice}</p>}

      <div className="orders-toolbar">
        <div>
          <h2>Список заказов</h2>
          <p>Ваши текущие и завершённые работы</p>
        </div>
        <button
          className="button button-primary"
          type="button"
          onClick={() => {
            setActionError("");
            setNotice("");
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
          {categoriesError && <p className="form-error" role="alert" data-testid="categories-error">{categoriesError}</p>}
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
        <div className="api-load-error" role="alert" data-testid="orders-load-error">
          <p>{ordersError}</p>
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
          {orders.map((order) => (
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
                <div className="order-list-footer">
                  <span>Создан {formatDate(order.createdAt)}</span>
                  {order.dueAt && <span>Срок {formatDate(order.dueAt)}</span>}
                  {order.location && <span>{order.location}</span>}
                </div>
              </div>
              <span className="order-card-arrow" aria-hidden="true">↗</span>
            </article>
          ))}
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

function getRequestError(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
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
