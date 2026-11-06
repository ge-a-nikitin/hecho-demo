import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ApiError, apiRequest } from "./api";
import { useToast } from "./toast";
import { useI18n } from "./i18n";

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
  const { t, format, plural, formatDate, errorMessage } = useI18n();

  const loadCategories = useCallback(async () => {
    setIsLoading(true);
    setLoadError(false);
    try {
      setCategories(await apiRequest<AdminCategory[]>(
        `/categories?includeInactive=${includeInactive ? "true" : "false"}`,
      ));
    } catch (error) {
      setLoadError(true);
      showToast(errorMessage(error, t.toasts.loadCategoriesFailed));
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
      showToast(t.toasts.categoryCreated, "success");
      await loadCategories();
    } catch (error) {
      showToast(errorMessage(error, t.toasts.createCategoryFailed));
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
      showToast(t.toasts.categoryRenamed, "success");
      await loadCategories();
    } catch (error) {
      showToast(errorMessage(error, t.toasts.renameCategoryFailed));
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
        category.isActive ? t.toasts.categoryDeactivated : t.toasts.categoryActivated,
        "success",
      );
      await loadCategories();
    } catch (error) {
      showToast(errorMessage(error, t.toasts.toggleCategoryFailed));
    } finally {
      setBusyId("");
    }
  }

  return (
    <section className="admin-section" aria-label={t.adminCategories.aria} data-testid="admin-categories">
      <div className="orders-toolbar">
        <div>
          <h2>{t.adminCategories.title}</h2>
          <p>{t.adminCategories.description}</p>
        </div>
        <button
          className="button button-quiet"
          type="button"
          onClick={() => void loadCategories()}
          disabled={isLoading}
          data-testid="refresh-categories"
        >
          {t.common.refresh}
        </button>
      </div>

      <form className="order-form compact-form" onSubmit={createCategory} data-testid="create-category-form">
        <div className="order-form-heading">
          <div className="eyebrow">{t.adminCategories.formEyebrow}</div>
          <h2>{t.adminCategories.formTitle}</h2>
          <p>{t.adminCategories.formText}</p>
        </div>
        <div className="inline-create-row">
          <label>
            {t.adminCategories.name}
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
            {isCreating ? t.adminCategories.creating : t.adminCategories.create}
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
          {t.adminCategories.showInactive}
        </label>
        <span>{plural(categories.length, t.adminCategories.count)}</span>
      </div>

      {loadError ? (
        <div className="api-load-error" role="group" data-testid="categories-load-error">
          <span>{t.adminCategories.loadError}</span>
          <button className="button button-quiet" type="button" onClick={() => void loadCategories()}>
            {t.common.retryLoad}
          </button>
        </div>
      ) : isLoading ? (
        <div className="orders-loading" role="status" data-testid="categories-loading">
          {t.adminCategories.loading}
        </div>
      ) : categories.length === 0 ? (
        <div className="empty-state compact-empty" data-testid="categories-empty">
          <span className="empty-state-icon" aria-hidden="true">✳</span>
          <h2>{t.adminCategories.emptyTitle}</h2>
          <p>{t.adminCategories.emptyText}</p>
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
                          {t.adminCategories.inactive}
                        </span>
                      )}
                    </div>
                  )}
                  <small>{format(t.adminCategories.createdOn, { date: formatDate(category.createdAt) })}</small>
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
                        {t.adminCategories.save}
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
                        {t.adminCategories.cancel}
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
                        {t.adminCategories.rename}
                      </button>
                      <button
                        className="button button-quiet"
                        type="button"
                        onClick={() => void toggleCategory(category)}
                        disabled={isBusy}
                        data-testid={`category-active-toggle-${category.id}`}
                      >
                        {category.isActive ? t.adminCategories.deactivate : t.adminCategories.activate}
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
  const { t, format, plural, formatDate, formatAmount, errorMessage } = useI18n();

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
      showToast(errorMessage(error, t.toasts.loadUsersFailed));
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
      showToast(t.toasts.executorCreated, "success");
      await loadUsers();
    } catch (error) {
      showToast(errorMessage(error, t.toasts.createExecutorFailed));
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
      showToast(t.toasts.executorNameUpdated, "success");
      await loadUsers();
    } catch (error) {
      showToast(errorMessage(error, t.toasts.updateExecutorNameFailed));
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
      showToast(t.toasts.passwordReset, "success");
    } catch (error) {
      showToast(errorMessage(error, t.toasts.resetPasswordFailed));
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
        user.isActive ? t.toasts.userDeactivated : t.toasts.userActivated,
        "success",
      );
      await loadUsers();
    } catch (error) {
      showToast(
        kind === "executor" && user.isActive && error instanceof ApiError && error.status === 409
          ? t.toasts.executorHasActiveOrders
          : errorMessage(error, t.toasts.changeUserStatusFailed),
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
                  {t.adminUsers.inactive}
                </span>
              )}
            </div>
          )}
          <small>{user.email}</small>
          {kind === "executor" && (
            <small>
              {user.hourlyRate === null || user.hourlyRate === undefined
                ? t.adminUsers.rateNotSet
                : format(t.adminUsers.rate, { amount: formatAmount(user.hourlyRate) })}
            </small>
          )}
          <small>{format(t.adminUsers.createdOn, { date: formatDate(user.createdAt) })}</small>
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
                {t.adminUsers.save}
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
                {t.adminUsers.cancel}
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
                placeholder={t.adminUsers.newPassword}
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
                {t.adminUsers.save}
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
                {t.adminUsers.cancel}
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
                  {t.adminUsers.editName}
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
                {t.adminUsers.resetPassword}
              </button>
              <button
                className="button button-quiet"
                type="button"
                onClick={() => void toggleActive(user, kind)}
                disabled={isBusy}
                data-testid={`toggle-user-active-${user.id}`}
              >
                {user.isActive ? t.adminUsers.deactivate : t.adminUsers.activate}
              </button>
            </>
          )}
        </div>
      </article>
    );
  }

  return (
    <section className="admin-section" aria-label={t.adminUsers.aria} data-testid="admin-users">
      <div className="orders-toolbar">
        <div>
          <h2>{t.adminUsers.title}</h2>
          <p>{t.adminUsers.description}</p>
        </div>
        <div className="role-toolbar-actions">
          <button className="button button-quiet" type="button" onClick={() => void loadUsers()} disabled={isLoading} data-testid="refresh-users">
            {t.common.refresh}
          </button>
          <button className="button button-primary" type="button" onClick={() => setIsCreateOpen((open) => !open)} data-testid="create-user-executor">
            {isCreateOpen ? t.adminUsers.close : t.adminUsers.addExecutor}
          </button>
        </div>
      </div>

      {isCreateOpen && (
        <form className="order-form" onSubmit={createExecutor} data-testid="create-user-executor-form">
          <div className="order-form-heading">
            <div className="eyebrow">{t.adminUsers.formEyebrow}</div>
            <h2>{t.adminUsers.formTitle}</h2>
            <p>{t.adminUsers.formText}</p>
          </div>
          <div className="order-form-grid">
            <label>{t.adminUsers.name}
              <input value={newName} onChange={(event) => setNewName(event.target.value)} maxLength={120} required data-testid="new-executor-name" />
            </label>
            <label>{t.adminUsers.email}
              <input type="email" value={newEmail} onChange={(event) => setNewEmail(event.target.value)} maxLength={254} required data-testid="new-executor-email" />
            </label>
            <label>{t.adminUsers.initialPassword}
              <input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} minLength={8} maxLength={128} required data-testid="new-executor-password" />
            </label>
          </div>
          <div className="order-form-actions">
            <button className="button button-primary" type="submit" disabled={isCreating} data-testid="submit-new-executor">
              {isCreating ? t.adminUsers.creating : t.adminUsers.create}
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
          {t.adminUsers.showInactive}
        </label>
        <span>{plural(executors.length + customers.length, t.adminUsers.count)}</span>
      </div>

      {loadError ? (
        <div className="api-load-error" role="group" data-testid="users-load-error">
          <span>{t.adminUsers.loadError}</span>
          <button className="button button-quiet" type="button" onClick={() => void loadUsers()}>
            {t.common.retryLoad}
          </button>
        </div>
      ) : isLoading ? (
        <div className="orders-loading" role="status" data-testid="users-loading">
          {t.adminUsers.loading}
        </div>
      ) : (
        <>
          <section className="order-group" aria-label={t.adminUsers.executors} data-testid="executors-list">
            <h3>{t.adminUsers.executors} <span>({executors.length})</span></h3>
            {executors.length === 0 ? (
              <p className="order-group-empty">{t.adminUsers.noExecutors}</p>
            ) : (
              <div className="admin-list">{executors.map((user) => renderUserRow(user, "executor"))}</div>
            )}
          </section>
          <section className="order-group" aria-label={t.adminUsers.customers} data-testid="customers-list">
            <h3>{t.adminUsers.customers} <span>({customers.length})</span></h3>
            {customers.length === 0 ? (
              <p className="order-group-empty">{t.adminUsers.noCustomers}</p>
            ) : (
              <div className="admin-list">{customers.map((user) => renderUserRow(user, "customer"))}</div>
            )}
          </section>
        </>
      )}
    </section>
  );
}
