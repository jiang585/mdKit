/**
 * 设置面板：通用（自动保存/编辑器/光标同步）、主题（独立主题/导入）、
 * 快捷键（E7 自定义绑定）、AI 后端（F7.1/F7.8/F7.9 多配置/密钥/脱敏/预览）。
 * 所有变更经 bridge 持久化到用户配置。
 */
import { memo, useCallback, useEffect, useState } from 'react';
import type { AiProfile, UserConfig } from '@shared/config-schema';
import type { ThemeSummary } from '@shared/theme-types';
import { AUTOSAVE_MIN_INTERVAL_MS } from '@shared/constants';
import { bridge } from '@renderer/shared/bridge';
import { nextId } from '@renderer/shared/text-utils';
import { DEFAULT_EDITOR_KEYS } from '@renderer/editor/index';
import { Modal } from './Modal';
import { toast } from './ui-store';

export interface SettingsDialogProps {
  open: boolean;
  config: UserConfig;
  themes: ThemeSummary[];
  onClose: () => void;
  onConfigChanged: (config: UserConfig) => void;
  onImportTheme: () => Promise<void>;
  initialSection?: SectionId;
}

type SectionId = 'general' | 'theme' | 'shortcuts' | 'ai';

const SECTIONS: Array<{ id: SectionId; label: string }> = [
  { id: 'general', label: '通用' },
  { id: 'theme', label: '主题' },
  { id: 'shortcuts', label: '快捷键' },
  { id: 'ai', label: 'AI 后端' },
];

/** 菜单级命令的默认键位（展示与重置用；编辑器内命令见 DEFAULT_EDITOR_KEYS） */
const MENU_KEY_DEFAULTS: Record<string, string> = {
  'file.new': 'CmdOrCtrl+N',
  'file.open': 'CmdOrCtrl+O',
  'file.save': 'CmdOrCtrl+S',
  'file.saveAs': 'CmdOrCtrl+Shift+S',
  'file.closeTab': 'CmdOrCtrl+W',
  'view.modeSplit': 'CmdOrCtrl+Alt+1',
  'view.modeEditor': 'CmdOrCtrl+Alt+2',
  'view.modePreview': 'CmdOrCtrl+Alt+3',
  'theme.next': 'CmdOrCtrl+K CmdOrCtrl+T',
};

const COMMAND_LABELS: Record<string, string> = {
  'file.new': '新建文件',
  'file.open': '打开文件',
  'file.save': '保存',
  'file.saveAs': '另存为',
  'file.closeTab': '关闭标签页',
  'view.modeSplit': '分屏模式',
  'view.modeEditor': '纯编辑模式',
  'view.modePreview': '纯预览模式',
  'theme.next': '切换主题',
  'editor.bold': '加粗',
  'editor.italic': '斜体',
  'editor.strikethrough': '删除线',
  'editor.inlineCode': '行内代码',
  'editor.heading1': '一级标题',
  'editor.heading2': '二级标题',
  'editor.heading3': '三级标题',
  'editor.insertTable': '插入表格',
  'editor.insertCodeBlock': '插入代码块',
  'editor.insertLink': '插入链接',
  'ai.inlineAssist': 'AI 行内辅助',
};

export const SettingsDialog = memo(function SettingsDialog(props: SettingsDialogProps) {
  const { open, config, themes, onClose, onConfigChanged, onImportTheme } = props;
  const [section, setSection] = useState<SectionId>(props.initialSection ?? 'general');

  useEffect(() => {
    if (open && props.initialSection) setSection(props.initialSection);
  }, [open, props.initialSection]);

  const patch = useCallback(
    async (partial: Parameters<ReturnType<typeof bridge>['config']['patch']>[0]) => {
      try {
        const next = await bridge().config.patch(partial);
        onConfigChanged(next);
      } catch {
        toast('error', '配置保存失败');
      }
    },
    [onConfigChanged],
  );

  return (
    <Modal open={open} title="设置" onClose={onClose} wide>
      <div className="mk-settings">
        <nav className="mk-settings-nav">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`mk-settings-nav-item ${section === s.id ? 'mk-settings-nav-on' : ''}`}
              onClick={() => setSection(s.id)}
            >
              {s.label}
            </button>
          ))}
        </nav>
        <div className="mk-settings-body">
          {section === 'general' && <GeneralSection config={config} patch={patch} />}
          {section === 'theme' && (
            <ThemeSection config={config} themes={themes} patch={patch} onImportTheme={onImportTheme} />
          )}
          {section === 'shortcuts' && <ShortcutsSection config={config} patch={patch} />}
          {section === 'ai' && <AiSection config={config} patch={patch} />}
        </div>
      </div>
    </Modal>
  );
});

type PatchFn = (partial: Record<string, unknown>) => Promise<void>;

function GeneralSection({ config, patch }: { config: UserConfig; patch: PatchFn }) {
  return (
    <div className="mk-settings-section">
      <h3>自动保存</h3>
      <label className="mk-field-row">
        <input
          type="checkbox"
          checked={config.autosave.enabled}
          onChange={(e) => void patch({ autosave: { enabled: e.target.checked } })}
        />
        启用自动保存（未保存文档写入恢复草稿）
      </label>
      <label className="mk-field-row">
        间隔（秒）
        <input
          className="mk-input mk-input-num"
          type="number"
          min={AUTOSAVE_MIN_INTERVAL_MS / 1000}
          max={600}
          value={Math.round(config.autosave.intervalMs / 1000)}
          onChange={(e) => {
            const seconds = Number(e.target.value);
            if (Number.isFinite(seconds) && seconds >= AUTOSAVE_MIN_INTERVAL_MS / 1000) {
              void patch({ autosave: { intervalMs: Math.round(seconds * 1000) } });
            }
          }}
        />
      </label>

      <h3>编辑器</h3>
      <label className="mk-field-row">
        字号
        <input
          className="mk-input mk-input-num"
          type="number"
          min={10}
          max={32}
          value={config.editor.fontSize}
          onChange={(e) => {
            const size = Number(e.target.value);
            if (size >= 10 && size <= 32) void patch({ editor: { fontSize: size } });
          }}
        />
      </label>
      <label className="mk-field-row">
        <input
          type="checkbox"
          checked={config.editor.lineNumbers}
          onChange={(e) => void patch({ editor: { lineNumbers: e.target.checked } })}
        />
        显示行号
      </label>
      <label className="mk-field-row">
        <input
          type="checkbox"
          checked={config.editor.wordWrap}
          onChange={(e) => void patch({ editor: { wordWrap: e.target.checked } })}
        />
        自动换行
      </label>
    </div>
  );
}

function ThemeSection({
  config,
  themes,
  patch,
  onImportTheme,
}: {
  config: UserConfig;
  themes: ThemeSummary[];
  patch: PatchFn;
  onImportTheme: () => Promise<void>;
}) {
  const linked = config.theme.linked;
  return (
    <div className="mk-settings-section">
      <h3>主题选择</h3>
      <label className="mk-field-row">
        <input
          type="checkbox"
          checked={linked}
          onChange={(e) =>
            void patch({
              theme: {
                linked: e.target.checked,
                ...(e.target.checked ? { previewThemeId: config.theme.editorThemeId } : {}),
              },
            })
          }
        />
        编辑区与预览区使用同一主题
      </label>
      <label className="mk-field-row">
        编辑区主题
        <select
          className="mk-select"
          value={config.theme.editorThemeId}
          onChange={(e) =>
            void patch({
              theme: {
                editorThemeId: e.target.value,
                ...(linked ? { previewThemeId: e.target.value } : {}),
              },
            })
          }
        >
          {themes.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}（{t.kind === 'light' ? '浅色' : '深色'}
              {t.builtin ? '' : ' · 自定义'}）
            </option>
          ))}
        </select>
      </label>
      {!linked && (
        <label className="mk-field-row">
          预览区主题
          <select
            className="mk-select"
            value={config.theme.previewThemeId}
            onChange={(e) => void patch({ theme: { previewThemeId: e.target.value } })}
          >
            {themes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}（{t.kind === 'light' ? '浅色' : '深色'}
                {t.builtin ? '' : ' · 自定义'}）
              </option>
            ))}
          </select>
        </label>
      )}
      <h3>自定义主题</h3>
      <p className="mk-settings-hint">
        导入 JSON 主题描述文件即可新增主题（经 JSON Schema 严格校验，无需改代码）。
      </p>
      <button type="button" className="mk-btn" onClick={() => void onImportTheme()}>
        导入主题文件…
      </button>
    </div>
  );
}

function ShortcutsSection({ config, patch }: { config: UserConfig; patch: PatchFn }) {
  const all: Record<string, string> = { ...MENU_KEY_DEFAULTS, ...DEFAULT_EDITOR_KEYS, 'ai.inlineAssist': 'Mod-k' };
  const [draft, setDraft] = useState<Record<string, string>>({});

  const commit = (command: string, value: string): void => {
    const trimmed = value.trim();
    if (trimmed === '' || trimmed === all[command]) {
      const rest = { ...config.shortcuts };
      delete rest[command];
      void patch({ shortcuts: rest });
    } else if (/^[\w+$-]+([ +-][\w$-]+)*$/i.test(trimmed)) {
      void patch({ shortcuts: { ...config.shortcuts, [command]: trimmed } });
    } else {
      toast('warning', `键位描述「${trimmed}」格式非法`);
    }
    setDraft((d) => {
      const rest = { ...d };
      delete rest[command];
      return rest;
    });
  };

  return (
    <div className="mk-settings-section">
      <p className="mk-settings-hint">
        快捷键遵循 VSCode 习惯（U3）。菜单命令用 <code>CmdOrCtrl+X</code> 形式，编辑器命令用{' '}
        <code>Mod-x</code> 形式；留空恢复默认。
      </p>
      <table className="mk-shortcut-table">
        <thead>
          <tr>
            <th>命令</th>
            <th>键位</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {Object.entries(all).map(([command, defaultKey]) => {
            const current = draft[command] ?? config.shortcuts[command] ?? defaultKey;
            const overridden = command in config.shortcuts;
            return (
              <tr key={command}>
                <td>{COMMAND_LABELS[command] ?? command}</td>
                <td>
                  <input
                    className={`mk-input mk-input-key ${overridden ? 'mk-input-overridden' : ''}`}
                    value={current}
                    onChange={(e) => setDraft((d) => ({ ...d, [command]: e.target.value }))}
                    onBlur={(e) => commit(command, e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                  />
                </td>
                <td>
                  {overridden && (
                    <button type="button" className="mk-link-btn" onClick={() => commit(command, '')}>
                      重置
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function AiSection({ config, patch }: { config: UserConfig; patch: PatchFn }) {
  const [keyDrafts, setKeyDrafts] = useState<Record<string, string>>({});
  const [keyStatus, setKeyStatus] = useState<Record<string, boolean>>({});
  const [testing, setTesting] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const entries = await Promise.all(
        config.ai.profiles.map(
          async (p) => [p.id, (await bridge().ai.secretStatus(p.id)).hasKey] as const,
        ),
      );
      setKeyStatus(Object.fromEntries(entries));
    })();
  }, [config.ai.profiles]);

  const updateProfile = (id: string, partial: Partial<AiProfile>): void => {
    const profiles = config.ai.profiles.map((p) => (p.id === id ? { ...p, ...partial } : p));
    void patch({ ai: { profiles } });
  };

  const addProfile = (): void => {
    const profile: AiProfile = {
      id: nextId('aiprof'),
      name: `后端 ${config.ai.profiles.length + 1}`,
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      scene: '通用',
      redact: false,
      previewRequests: false,
    };
    void patch({
      ai: {
        profiles: [...config.ai.profiles, profile],
        activeProfileId: config.ai.activeProfileId ?? profile.id,
      },
    });
  };

  const removeProfile = (id: string): void => {
    const profiles = config.ai.profiles.filter((p) => p.id !== id);
    void bridge().ai.secretSet(id, '');
    void patch({
      ai: {
        profiles,
        activeProfileId: config.ai.activeProfileId === id ? (profiles[0]?.id ?? null) : config.ai.activeProfileId,
      },
    });
  };

  const saveKey = async (id: string): Promise<void> => {
    const key = keyDrafts[id] ?? '';
    const res = await bridge().ai.secretSet(id, key);
    if (res.ok) {
      toast('success', key ? '密钥已加密保存' : '密钥已清除');
      setKeyDrafts((d) => ({ ...d, [id]: '' }));
      setKeyStatus((s) => ({ ...s, [id]: key !== '' }));
    } else {
      toast('error', res.message ?? '密钥保存失败');
    }
  };

  const test = async (id: string): Promise<void> => {
    setTesting(id);
    try {
      const res = await bridge().ai.testConnection(id);
      toast(res.ok ? 'success' : 'error', res.message);
    } finally {
      setTesting(null);
    }
  };

  return (
    <div className="mk-settings-section">
      <p className="mk-settings-hint">
        兼容 OpenAI 协议的任意后端（F7.1）：自行配置 API 地址、模型与密钥。密钥经操作系统安全存储加密，
        绝不写入配置文件或日志（F7.9）。更换后端仅需修改此处配置（验收标准 9）。
      </p>
      {config.ai.profiles.map((p) => (
        <div key={p.id} className="mk-ai-profile">
          <div className="mk-ai-profile-head">
            <input
              className="mk-input mk-ai-name"
              value={p.name}
              aria-label="配置名称"
              onChange={(e) => updateProfile(p.id, { name: e.target.value })}
            />
            <select
              className="mk-select"
              value={p.scene}
              aria-label="使用场景"
              onChange={(e) => updateProfile(p.id, { scene: e.target.value })}
            >
              {['通用', '写作', '代码', '翻译'].map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            {config.ai.activeProfileId === p.id ? (
              <span className="mk-badge">当前使用</span>
            ) : (
              <button
                type="button"
                className="mk-link-btn"
                onClick={() => void patch({ ai: { activeProfileId: p.id } })}
              >
                设为当前
              </button>
            )}
            <button type="button" className="mk-link-btn mk-danger" onClick={() => removeProfile(p.id)}>
              删除
            </button>
          </div>
          <label className="mk-field-row">
            API 地址
            <input
              className="mk-input"
              value={p.baseUrl}
              placeholder="https://api.openai.com/v1"
              onChange={(e) => updateProfile(p.id, { baseUrl: e.target.value })}
            />
          </label>
          <label className="mk-field-row">
            模型名称
            <input
              className="mk-input"
              value={p.model}
              onChange={(e) => updateProfile(p.id, { model: e.target.value })}
            />
          </label>
          <div className="mk-field-row">
            <input
              className="mk-input"
              type="password"
              placeholder={keyStatus[p.id] ? '已保存密钥（输入以更换）' : '输入 API 密钥'}
              value={keyDrafts[p.id] ?? ''}
              onChange={(e) => setKeyDrafts((d) => ({ ...d, [p.id]: e.target.value }))}
            />
            <button type="button" className="mk-btn" onClick={() => void saveKey(p.id)}>
              保存密钥
            </button>
            <button
              type="button"
              className="mk-btn"
              disabled={testing === p.id}
              onClick={() => void test(p.id)}
            >
              {testing === p.id ? '测试中…' : '测试连接'}
            </button>
          </div>
          <label className="mk-field-row">
            <input
              type="checkbox"
              checked={p.redact}
              onChange={(e) => updateProfile(p.id, { redact: e.target.checked })}
            />
            脱敏模式：发送前自动摘除邮箱/路径/密钥等敏感内容
          </label>
          <label className="mk-field-row">
            <input
              type="checkbox"
              checked={p.previewRequests}
              onChange={(e) => updateProfile(p.id, { previewRequests: e.target.checked })}
            />
            每次请求前预览发送内容
          </label>
        </div>
      ))}
      <button type="button" className="mk-btn" onClick={addProfile}>
        ＋ 添加后端配置
      </button>
    </div>
  );
}
