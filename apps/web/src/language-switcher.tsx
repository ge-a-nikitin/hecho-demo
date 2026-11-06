import { languageNames, languages, useI18n } from "./i18n";

export function LanguageSwitcher({ className = "" }: { className?: string }) {
  const { language, setLanguage, t } = useI18n();

  return (
    <div
      className={`language-switcher${className ? ` ${className}` : ""}`}
      role="group"
      aria-label={t.language.label}
      data-testid="language-switcher"
    >
      {languages.map((option) => (
        <button
          key={option}
          type="button"
          className={`language-option${option === language ? " active" : ""}`}
          aria-pressed={option === language}
          onClick={() => setLanguage(option)}
          data-testid={`language-${option}`}
        >
          {languageNames[option]}
        </button>
      ))}
    </div>
  );
}
