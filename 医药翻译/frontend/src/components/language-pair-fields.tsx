import { supportedLanguages } from "../constants";

type LanguagePairFieldsProps = {
  sourceLang: string;
  targetLang: string;
  onSourceLangChange: (value: string) => void;
  onTargetLangChange: (value: string) => void;
};

export function LanguagePairFields({
  sourceLang,
  targetLang,
  onSourceLangChange,
  onTargetLangChange
}: LanguagePairFieldsProps) {
  return (
    <div className="inline-fields">
      <label>
        源语言
        <select value={sourceLang} onChange={(event) => onSourceLangChange(event.target.value)}>
          <option value="auto">自动检测</option>
          {supportedLanguages.map((item) => (
            <option key={item.code} value={item.code}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        目标语言
        <select value={targetLang} onChange={(event) => onTargetLangChange(event.target.value)}>
          {supportedLanguages.map((item) => (
            <option key={item.code} value={item.code}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
