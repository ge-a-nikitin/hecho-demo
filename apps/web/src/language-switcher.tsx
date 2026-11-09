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
          aria-label={languageNames[option]}
          onClick={() => setLanguage(option)}
          data-testid={`language-${option}`}
        >
          <span className="language-option-name">{languageNames[option]}</span>
          <span className="language-option-code" aria-hidden="true">{option.toUpperCase()}</span>
        </button>
      ))}

    </div>
  );
}
