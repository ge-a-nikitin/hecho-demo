import { useCallback, useEffect, useState, type FormEvent } from "react";
import { apiRequest, getUserFacingError } from "./api";
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

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(value));
}
