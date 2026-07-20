import de from './de.js';
import en from './en.js';
import es from './es.js';
import fr from './fr.js';
import it from './it.js';
import nl from './nl.js';
import pl from './pl.js';
import pt from './pt.js';

const languages = { de, en, es, fr, it, nl, pl, pt };
const fallbackLanguage = 'en';

export function getLanguage() {
  const browserLanguages = navigator.languages || [navigator.language || ''];
  const availableLanguages = Object.keys(languages);

  for (const language of browserLanguages) {
    const normalized = String(language).toLowerCase();
    const base = normalized.split('-')[0];
    if (availableLanguages.includes(normalized)) return normalized;
    if (availableLanguages.includes(base)) return base;
  }

  return fallbackLanguage;
}

export function text(section, key) {
  const language = getLanguage();
  const selected = languages[language] || languages[fallbackLanguage];
  const fallback = languages[fallbackLanguage];

  return (
    selected[section]?.[key] ||
    fallback[section]?.[key] ||
    key
  );
}
