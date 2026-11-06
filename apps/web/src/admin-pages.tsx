import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ApiError, apiRequest, getUserFacingError } from "./api";
import { useToast } from "./toast";

type AdminCategory = {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: string;
};

export function AdminCategoriesPage() {
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [includeInactive, setIncludeInactive] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [newName, setNewName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState("");
  const [editingName, setEditingName] = useState("");
  const [busyId, setBusyId] = useState("");
  const { showToast } = useToast();

  const loadCategories = useCallback(async () => {
    setIsLoading(true);
    setLoadError(false);
    try {
      setCategories(await apiRequest<AdminCategory[]>(
        `/categories?includeInactive=${includeInactive ? "true" : "false"}`,
      ));
    } catch (error) {
      setLoadError(true);
      showToast(getUserFacingError(error, "Не удалось загрузить категории."));
    } finally {
      setIsLoading(false);
    }
  }, [includeInactive, showToast]);

  useEffect(() => {
    void loadCategories();
  }, [loadCategories]);

  async function createCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setIsCreating(true);
    try {
      await apiRequest("/categories", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      setNewName("");
      showToast("Категория создана.", "success");
      await loadCategories();
    } catch (error) {
      showToast(getUserFacingError(error, "Не удалось создать категорию."));
    } finally {
      setIsCreating(false);
    }
  }

  async function renameCategory(category: AdminCategory) {
    const name = editingName.trim();
    if (!name) return;
    setBusyId(category.id);
    try {
      await apiRequest(`/categories/${encodeURIComponent(category.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ name }),
      });
      setEditingId("");
      setEditingName("");
      showToast("Категория переименована.", "success");
      await loadCategories();
    } catch (error) {
      showToast(getUserFacingError(error, "Не удалось переименовать категорию."));
    } finally {
      setBusyId("");
    }
  }

  async function toggleCategory(category: AdminCategory) {
    setBusyId(category.id);
    try {
      await apiRequest(
        `/categories/${encodeURIComponent(category.id)}/active?active=${category.isActive ? "false" : "true"}`,
        { method: "PATCH" },
      );
      showToast(
        category.isActive ? "Категория деактивирована." : "Категория снова доступна.",
        "success",
      );
      await loadCategories();
    } catch (error) {
      showToast(getUserFacingError(error, "Не удалось изменить доступность категории."));
    } finally {
      setBusyId("");
    }
  }

  return (
    <section className="admin-section" aria-label="Управление категориями" data-testid="admin-categories">
      <div className="orders-toolbar">
        <div>
          <h2>Категории работ</h2>
          <p>Заказчики выбирают категорию при создании заказа</p>
        </div>
        <button
          className="button button-quiet"
          type="button"
          onClick={() => void loadCategories()}
          disabled={isLoading}
          data-testid="refresh-categories"
        >
          Обновить
        </button>
      </div>

      <form className="order-form compact-form" onSubmit={createCategory} data-testid="create-category-form">
        <div className="order-form-heading">
          <div className="eyebrow">НОВАЯ КАТЕГОРИЯ</div>
          <h2>Добавить направление работ</h2>
          <p>Название сразу станет доступно заказчикам.</p>
        </div>
        <div className="inline-create-row">
          <label>
            Название
            <input
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              maxLength={100}
              required
              data-testid="category-name-input"
            />
          </label>
          <button
            className="button button-primary"
            type="submit"
            disabled={isCreating || !newName.trim()}
            data-testid="create-category"
          >
            {isCreating ? "Создаём…" : "Создать категорию"}
          </button>
        </div>
      </form>

      <div className="admin-list-toolbar">
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={includeInactive}
            onChange={(event) => setIncludeInactive(event.target.checked)}
            data-testid="category-show-inactive"
          />
          Показывать неактивные
        </label>
        <span>{categories.length} шт.</span>
      </div>

      {loadError ? (
        <div className="api-load-error" role="group" data-testid="categories-load-error">
          <span>Не удалось загрузить категории.</span>
          <button className="button button-quiet" type="button" onClick={() => void loadCategories()}>
            Повторить загрузку
          </button>
        </div>
      ) : isLoading ? (
        <div className="orders-loading" role="status" data-testid="categories-loading">
          Загружаем категории…
        </div>
      ) : categories.length === 0 ? (
        <div className="empty-state compact-empty" data-testid="categories-empty">
          <span className="empty-state-icon" aria-hidden="true">✳</span>
          <h2>Категорий пока нет</h2>
          <p>Создайте первую категорию, чтобы заказчики могли оформлять заказы.</p>
        </div>
      ) : (
        <div className="admin-list" data-testid="categories-list">
          {categories.map((category) => {
            const isEditing = editingId === category.id;
            const isBusy = busyId === category.id;
            return (
              <article
                className={`admin-list-row${category.isActive ? "" : " admin-list-row-inactive"}`}
                key={category.id}
                data-testid={`category-row-${category.id}`}
              >
                <div className="admin-list-row-main">
                  {isEditing ? (
                    <input
                      className="inline-edit-input"
                      value={editingName}
                      onChange={(event) => setEditingName(event.target.value)}
                      maxLength={100}
                      autoFocus
                      data-testid={`category-edit-name-${category.id}`}
                    />
                  ) : (
                    <div className="admin-list-title">
                      <b>{category.name}</b>
                      {!category.isActive && (
                        <span className="admin-status-badge" data-testid={`category-inactive-${category.id}`}>
                          Неактивна
                        </span>
                      )}
                    </div>
                  )}
                  <small>Создана {formatDate(category.createdAt)}</small>
                </div>
                <div className="admin-list-actions">
                  {isEditing ? (
                    <>
                      <button
                        className="button button-primary button-compact"
                        type="button"
                        onClick={() => void renameCategory(category)}
                        disabled={isBusy || !editingName.trim()}
                        data-testid={`save-category-${category.id}`}
                      >
                        Сохранить
                      </button>
                      <button
                        className="button button-quiet"
                        type="button"
                        onClick={() => {
                          setEditingId("");
                          setEditingName("");
                        }}
                        disabled={isBusy}
                        data-testid={`cancel-category-rename-${category.id}`}
                      >
                        Отмена
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className="button button-quiet"
                        type="button"
                        onClick={() => {
                          setEditingId(category.id);
                          setEditingName(category.name);
                        }}
                        data-testid={`rename-category-${category.id}`}
                      >
                        Переименовать
                      </button>
                      <button
                        className="button button-quiet"
                        type="button"
                        onClick={() => void toggleCategory(category)}
                        disabled={isBusy}
                        data-testid={`category-active-toggle-${category.id}`}
                      >
                        {category.isActive ? "Деактивировать" : "Активировать"}
                      </button>
                    </>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

type AdminUser = {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  hourlyRate?: number | string | null;
  createdAt: string;
};

export function AdminUsersPage() {
  const [executors, setExecutors] = useState<AdminUser[]>([]);
  const [customers, setCustomers] = useState<AdminUser[]>([]);
  const [includeInactive, setIncludeInactive] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [editingId, setEditingId] = useState("");
  const [editingName, setEditingName] = useState("");
  const [resettingId, setResettingId] = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const [busyId, setBusyId] = useState("");
  const { showToast } = useToast();

  const loadUsers = useCallback(async () => {
    setIsLoading(true);
    setLoadError(false);
    try {
      const query = `includeInactive=${includeInactive ? "true" : "false"}`;
      const [nextExecutors, nextCustomers] = await Promise.all([
        apiRequest<AdminUser[]>(`/users/executors?${query}`),
        apiRequest<AdminUser[]>(`/users/customers?${query}`),
      ]);
      setExecutors(nextExecutors);
      setCustomers(nextCustomers);
    } catch (error) {
      setLoadError(true);
      showToast(getUserFacingError(error, "Не удалось загрузить пользователей."));
    } finally {
      setIsLoading(false);
    }
  }, [includeInactive, showToast]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  async function createExecutor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsCreating(true);
    try {
      await apiRequest("/users/executors", {
        method: "POST",
        body: JSON.stringify({
          name: newName.trim(),
          email: newEmail.trim(),
          password: newPassword,
        }),
      });
      setNewName("");
      setNewEmail("");
      setNewPassword("");
      setIsCreateOpen(false);
      showToast("Учётная запись исполнителя создана.", "success");
      await loadUsers();
    } catch (error) {
      showToast(getUserFacingError(error, "Не удалось создать исполнителя."));
    } finally {
      setIsCreating(false);
    }
  }

  async function renameExecutor(user: AdminUser) {
    const name = editingName.trim();
    if (!name) return;
    setBusyId(user.id);
    try {
      await apiRequest(`/users/executors/${encodeURIComponent(user.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ name }),
      });
      setEditingId("");
      setEditingName("");
      showToast("Имя исполнителя обновлено.", "success");
      await loadUsers();
    } catch (error) {
      showToast(getUserFacingError(error, "Не удалось обновить имя исполнителя."));
    } finally {
      setBusyId("");
    }
  }

  async function resetUserPassword(user: AdminUser) {
    if (resetPassword.length < 8) return;
    setBusyId(user.id);
    try {
      await apiRequest(`/users/${encodeURIComponent(user.id)}/reset-password`, {
        method: "POST",
        body: JSON.stringify({ password: resetPassword }),
      });
      setResettingId("");
      setResetPassword("");
      showToast("Пароль изменён, активные сеансы пользователя завершены.", "success");
    } catch (error) {
      showToast(getUserFacingError(error, "Не удалось сбросить пароль."));
    } finally {
      setBusyId("");
    }
  }

  async function toggleActive(user: AdminUser, kind: "executor" | "customer") {
    setBusyId(user.id);
    try {
      await apiRequest(
        `/users/${encodeURIComponent(user.id)}/active?active=${user.isActive ? "false" : "true"}`,
        { method: "PATCH" },
      );
      showToast(
        user.isActive ? "Учётная запись деактивирована." : "Учётная запись активирована.",
        "success",
      );
      await loadUsers();
    } catch (error) {
      showToast(
        kind === "executor" && user.isActive && error instanceof ApiError && error.status === 409
          ? "Не удалось деактивировать исполнителя: сначала переназначьте его незавершённые заказы."
          : getUserFacingError(error, "Не удалось изменить статус учётной записи."),
      );
    } finally {
      setBusyId("");
    }
  }

  function renderUserRow(user: AdminUser, kind: "executor" | "customer") {
    const isEditing = editingId === user.id;
    const isResetting = resettingId === user.id;
    const isBusy = busyId === user.id;
    return (
      <article
        className={`admin-list-row${user.isActive ? "" : " admin-list-row-inactive"}`}
        key={user.id}
        data-testid={`${kind}-user-row-${user.id}`}
      >
        <div className="admin-list-row-main">
          {isEditing ? (
            <input
              className="inline-edit-input"
              value={editingName}
              onChange={(event) => setEditingName(event.target.value)}
              maxLength={120}
              autoFocus
              data-testid={`executor-name-input-${user.id}`}
            />
          ) : (
            <div className="admin-list-title">
              <b>{user.name}</b>
              {!user.isActive && (
                <span className="admin-status-badge" data-testid={`user-inactive-${user.id}`}>
                  Неактивен
                </span>
              )}
            </div>
          )}
          <small>{user.email}</small>
          {kind === "executor" && (
            <small>
              {user.hourlyRate === null || user.hourlyRate === undefined
                ? "Ставка не задана"
                : `${formatAmount(user.hourlyRate)} / ч`}
            </small>
          )}
          <small>Создан {formatDate(user.createdAt)}</small>
        </div>
        <div className="admin-list-actions">
          {isEditing ? (
            <>
              <button
                className="button button-primary button-compact"
                type="button"
                onClick={() => void renameExecutor(user)}
                disabled={isBusy || !editingName.trim()}
                data-testid={`save-executor-name-${user.id}`}
              >
                Сохранить
              </button>
              <button
                className="button button-quiet"
                type="button"
                onClick={() => {
                  setEditingId("");
                  setEditingName("");
                }}
                disabled={isBusy}
                data-testid={`cancel-executor-name-${user.id}`}
              >
                Отмена
              </button>
            </>
          ) : isResetting ? (
            <>
              <input
                className="inline-edit-input"
                type="password"
                value={resetPassword}
                onChange={(event) => setResetPassword(event.target.value)}
                minLength={8}
                maxLength={128}
                placeholder="Новый пароль"
                autoFocus
                data-testid={`new-password-${user.id}`}
              />
              <button
                className="button button-primary button-compact"
                type="button"
                onClick={() => void resetUserPassword(user)}
                disabled={isBusy || resetPassword.length < 8}
                data-testid={`save-user-password-${user.id}`}
              >
                Сохранить
              </button>
              <button
                className="button button-quiet"
                type="button"
                onClick={() => {
                  setResettingId("");
                  setResetPassword("");
                }}
                disabled={isBusy}
                data-testid={`cancel-user-password-${user.id}`}
              >
                Отмена
              </button>
            </>
          ) : (
            <>
              {kind === "executor" && (
                <button
                  className="button button-quiet"
                  type="button"
                  onClick={() => {
                    setResettingId("");
                    setResetPassword("");
                    setEditingId(user.id);
                    setEditingName(user.name);
                  }}
                  data-testid={`edit-executor-name-${user.id}`}
                >
                  Изменить имя
                </button>
              )}
              <button
                className="button button-quiet"
                type="button"
                disabled={!user.isActive}
                onClick={() => {
                  setEditingId("");
                  setEditingName("");
                  setResettingId(user.id);
                  setResetPassword("");
                }}
                data-testid={`reset-user-password-${user.id}`}
              >
                Сбросить пароль
              </button>
              <button
                className="button button-quiet"
                type="button"
                onClick={() => void toggleActive(user, kind)}
                disabled={isBusy}
                data-testid={`toggle-user-active-${user.id}`}
              >
                {user.isActive ? "Деактивировать" : "Активировать"}
              </button>
            </>
          )}
        </div>
      </article>
    );
  }

  return (
    <section className="admin-section" aria-label="Управление пользователями" data-testid="admin-users">
      <div className="orders-toolbar">
        <div>
          <h2>Пользователи</h2>
          <p>Исполнители и заказчики, доступ к аккаунтам и пароли</p>
        </div>
        <div className="role-toolbar-actions">
          <button className="button button-quiet" type="button" onClick={() => void loadUsers()} disabled={isLoading} data-testid="refresh-users">
            Обновить
          </button>
          <button className="button button-primary" type="button" onClick={() => setIsCreateOpen((open) => !open)} data-testid="create-user-executor">
            {isCreateOpen ? "Закрыть" : "+ Исполнитель"}
          </button>
        </div>
      </div>

      {isCreateOpen && (
        <form className="order-form" onSubmit={createExecutor} data-testid="create-user-executor-form">
          <div className="order-form-heading">
            <div className="eyebrow">КОМАНДА</div>
            <h2>Новый исполнитель</h2>
            <p>Учётная запись создаётся с ролью исполнителя. Ставку исполнитель задаёт сам в профиле.</p>
          </div>
          <div className="order-form-grid">
            <label>Имя
              <input value={newName} onChange={(event) => setNewName(event.target.value)} maxLength={120} required data-testid="new-executor-name" />
            </label>
            <label>Электронная почта
              <input type="email" value={newEmail} onChange={(event) => setNewEmail(event.target.value)} maxLength={254} required data-testid="new-executor-email" />
            </label>
            <label>Начальный пароль
              <input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} minLength={8} maxLength={128} required data-testid="new-executor-password" />
            </label>
          </div>
          <div className="order-form-actions">
            <button className="button button-primary" type="submit" disabled={isCreating} data-testid="submit-new-executor">
              {isCreating ? "Создаём…" : "Создать исполнителя"}
            </button>
          </div>
        </form>
      )}

      <div className="admin-list-toolbar">
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={includeInactive}
            onChange={(event) => setIncludeInactive(event.target.checked)}
            data-testid="users-show-inactive"
          />
          Показывать неактивных
        </label>
        <span>{executors.length + customers.length} чел.</span>
      </div>

      {loadError ? (
        <div className="api-load-error" role="group" data-testid="users-load-error">
          <span>Не удалось загрузить пользователей.</span>
          <button className="button button-quiet" type="button" onClick={() => void loadUsers()}>
            Повторить загрузку
          </button>
        </div>
      ) : isLoading ? (
        <div className="orders-loading" role="status" data-testid="users-loading">
          Загружаем пользователей…
        </div>
      ) : (
        <>
          <section className="order-group" aria-label="Исполнители" data-testid="executors-list">
            <h3>Исполнители <span>({executors.length})</span></h3>
            {executors.length === 0 ? (
              <p className="order-group-empty">Исполнителей пока нет.</p>
            ) : (
              <div className="admin-list">{executors.map((user) => renderUserRow(user, "executor"))}</div>
            )}
          </section>
          <section className="order-group" aria-label="Заказчики" data-testid="customers-list">
            <h3>Заказчики <span>({customers.length})</span></h3>
            {customers.length === 0 ? (
              <p className="order-group-empty">Заказчиков пока нет.</p>
            ) : (
              <div className="admin-list">{customers.map((user) => renderUserRow(user, "customer"))}</div>
            )}
          </section>
        </>
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

function formatAmount(value: number | string): string {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(Number(value));
}
