// src/components/settings/SettingControl.tsx
import { t } from "@/i18n";
import type React from 'react';

import type { Setting } from '../../contexts/SettingsContext';
import { SettingsCodeMirror } from './SettingsCodeMirror';
import SettingsLanguage from './SettingsLanguage';
import { useSettings } from '../../hooks/useSettings';

interface SettingControlProps {
  setting: Setting & {
    label: React.ReactNode;
    description?: React.ReactNode;
  };
}

const SettingControl: React.FC<SettingControlProps> = ({ setting }) => {
  const { updateSetting } = useSettings();
  const value =
  setting.value !== undefined ? setting.value : setting.defaultValue;

  const handleChange = (newValue: unknown) => {
    updateSetting(setting.id, newValue);
  };

  const renderControl = () => {
    switch (setting.type) {
      case 'checkbox':
        return (
          <label className="checkbox-control">
						<input
              type="checkbox"
              checked={Boolean(value)}
              onChange={(e) => handleChange(e.target.checked)} />

						<span>{setting.label}</span>
					</label>);


      case 'select':
        return (
          <div className="select-control">
						<label>{setting.label}</label>
						<select
              value={String(value)}
              onChange={(e) => handleChange(e.target.value)}>

							{setting.options?.map((option) =>
              <option key={String(option.value)} value={String(option.value)}>
									{option.label}
								</option>
              )}
						</select>
					</div>);


      case 'text':
        return (
          <div className="text-control">
						<label>{setting.label}</label>
						<input
              type="text"
              value={String(value)}
              onChange={(e) => handleChange(e.target.value)} />

					</div>);


      case 'codemirror':
        return (
          <SettingsCodeMirror
            setting={setting}
            value={setting.value as string}
            onChange={(value) => updateSetting(setting.id, value)} />);



      case 'language-select':
        return (
          <SettingsLanguage setting={setting} />);


      case 'number':
        return (
          <div className="number-control">
						<label>{setting.label}</label>
						<input
              type="number"
              value={Number(value)}
              min={setting.min}
              max={setting.max}
              onChange={(e) => handleChange(Number(e.target.value))} />

					</div>);


      case 'color':
        return (
          <div className="color-control">
						<label>{setting.label}</label>
						<input
              type="color"
              value={String(value)}
              onChange={(e) => handleChange(e.target.value)} />

					</div>);


      default:
        return <div>{t('Unsupported setting type:')}{setting.type}</div>;
    }
  };

  return (
    <div className="setting-control">
			{renderControl()}
			{setting.description && setting.type !== 'language-select' &&
      <div className="setting-description">{setting.description}</div>
      }
		</div>);

};

export default SettingControl;