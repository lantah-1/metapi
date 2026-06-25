import React from 'react';
import CenteredModal from '../../components/CenteredModal.js';

type AccountModelRow = {
  name: string;
  latencyMs: number | null;
  isManual?: boolean;
};

type AccountModelModalState = {
  open: boolean;
  account: any | null;
  models: AccountModelRow[];
  loading: boolean;
  siteName: string;
  manualModelsInput: string;
  addingManualModels: boolean;
};

type AccountModelsModalProps = {
  modelModal: AccountModelModalState;
  inputStyle: React.CSSProperties;
  onClose: () => void;
  onRefresh: () => Promise<void> | void;
  onManualInputChange: (value: string) => void;
  onAddManualModels: () => Promise<void> | void;
};

export default function AccountModelsModal({
  modelModal,
  inputStyle,
  onClose,
  onRefresh,
  onManualInputChange,
  onAddManualModels,
}: AccountModelsModalProps) {
  return (
    <CenteredModal
      open={modelModal.open}
      onClose={onClose}
      title={modelModal.siteName ? `模型列表 · ${modelModal.siteName}` : '模型列表'}
      maxWidth={600}
      footer={(
        <button onClick={onClose} className="btn btn-primary">关闭</button>
      )}
    >
      {modelModal.loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 0', gap: 10 }}>
          <span className="spinner" />
          <span style={{ color: 'var(--color-text-muted)', fontSize: 14 }}>加载模型列表...</span>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {modelModal.models.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 0' }}>
              <div style={{ fontSize: 14, color: 'var(--color-text-muted)', marginBottom: 8 }}>暂无可用模型</div>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 16 }}>请先点击账号操作栏中的「刷新」或「模型」按钮获取模型</div>
              <button
                onClick={() => void onRefresh()}
                className="btn btn-soft-primary"
              >
                立即获取模型
              </button>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
                  已发现 <strong style={{ color: 'var(--color-text-primary)' }}>{modelModal.models.length}</strong> 个模型
                </span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    onClick={() => void onRefresh()}
                    className="btn btn-ghost"
                    style={{ fontSize: 12, padding: '4px 10px' }}
                  >
                    刷新模型
                  </button>
                </div>
              </div>

              <div style={{
                maxHeight: 280,
                overflowY: 'auto',
                border: '1px solid var(--color-border-light)',
                borderRadius: 'var(--radius-sm)',
              }}>
                {modelModal.models.map((model, idx) => {
                  return (
                    <div
                      key={model.name}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '9px 14px',
                        borderBottom: idx < modelModal.models.length - 1 ? '1px solid var(--color-border-light)' : undefined,
                      }}
                    >
                      <span style={{ flex: 1, fontSize: 13, fontFamily: 'var(--font-mono)', wordBreak: 'break-all' }}>
                        {model.name}
                      </span>
                      {model.latencyMs != null ? (
                        <span style={{ fontSize: 11, color: 'var(--color-text-muted)', flexShrink: 0 }}>
                          {model.latencyMs}ms
                        </span>
                      ) : null}
                      {model.isManual ? (
                        <span className="badge badge-info" style={{ fontSize: 10, flexShrink: 0, padding: '0 4px' }}>手动</span>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          <div style={{ marginTop: 16, padding: '12px', background: 'var(--color-bg)', border: '1px solid var(--color-border-light)', borderRadius: 'var(--radius-sm)' }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--color-text-primary)' }}>手动添加可用模型</div>
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 8 }}>
              如果您的账号支持某些未在上方列表中显示的模型，可以在此手动添加（多个以英文逗号分隔）。
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                placeholder="例如: gpt-4-custom, claude-3-5-sonnet-20241022"
                value={modelModal.manualModelsInput}
                onChange={(e) => onManualInputChange(e.target.value)}
                style={{ ...inputStyle, flex: 1, fontFamily: 'var(--font-mono)' }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !modelModal.addingManualModels) {
                    void onAddManualModels();
                  }
                }}
              />
              <button
                disabled={!modelModal.manualModelsInput.trim() || modelModal.addingManualModels}
                onClick={() => void onAddManualModels()}
                className="btn btn-primary btn-sm"
                style={{ whiteSpace: 'nowrap' }}
              >
                {modelModal.addingManualModels ? <span className="spinner spinner-sm" /> : '添加'}
              </button>
            </div>
          </div>
        </div>
      )}
    </CenteredModal>
  );
}
