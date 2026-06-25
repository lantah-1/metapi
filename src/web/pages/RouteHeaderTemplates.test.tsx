import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { ToastProvider } from '../components/Toast.js';
import RouteHeaderTemplates from './RouteHeaderTemplates.js';

const { apiMock } = vi.hoisted(() => ({
  apiMock: {
    getRouteHeaderTemplates: vi.fn(),
    addRouteHeaderTemplate: vi.fn(),
    updateRouteHeaderTemplate: vi.fn(),
    deleteRouteHeaderTemplate: vi.fn(),
  },
}));

vi.mock('../api.js', () => ({
  api: apiMock,
}));

type TestRenderer = ReturnType<typeof create>;

function collectText(node: ReactTestInstance): string {
  return (node.children || []).map((child) => {
    if (typeof child === 'string') return child;
    return collectText(child);
  }).join('');
}

async function flushMicrotasks() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function findButtonByText(root: ReactTestInstance, text: string): ReactTestInstance {
  return root.find((node) => (
    node.type === 'button'
    && collectText(node).includes(text)
  ));
}

function findInputByPlaceholder(root: ReactTestInstance, placeholder: string): ReactTestInstance {
  return root.find((node) => (
    node.type === 'input'
    && node.props.placeholder === placeholder
  ));
}

async function renderPage(): Promise<TestRenderer> {
  let root!: TestRenderer;
  await act(async () => {
    root = create(
      <ToastProvider>
        <RouteHeaderTemplates />
      </ToastProvider>,
    );
  });
  await flushMicrotasks();
  return root;
}

describe('RouteHeaderTemplates page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('confirm', vi.fn(() => true));
    apiMock.getRouteHeaderTemplates.mockResolvedValue([]);
    apiMock.addRouteHeaderTemplate.mockResolvedValue({ id: 1, name: 'Codex Header', headers: '{"x-codex":"1"}' });
    apiMock.updateRouteHeaderTemplate.mockResolvedValue({});
    apiMock.deleteRouteHeaderTemplate.mockResolvedValue({});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('creates a reusable header template from key/value rows', async () => {
    const root = await renderPage();
    try {
      await act(async () => {
        findInputByPlaceholder(root.root, '例如 Codex GPT Header').props.onChange({ target: { value: 'Codex Header' } });
        findInputByPlaceholder(root.root, 'Header 名称').props.onChange({ target: { value: 'x-codex-client' } });
        findInputByPlaceholder(root.root, 'Header 值').props.onChange({ target: { value: 'cc-switch' } });
      });

      await act(async () => {
        findButtonByText(root.root, '创建模板').props.onClick();
      });
      await flushMicrotasks();

      expect(apiMock.addRouteHeaderTemplate).toHaveBeenCalledWith({
        name: 'Codex Header',
        description: null,
        headers: {
          'x-codex-client': 'cc-switch',
        },
      });
    } finally {
      root.unmount();
    }
  });
});
