import { render, type RenderOptions } from "@testing-library/react";
import { MemoryRouter, type MemoryRouterProps } from "react-router-dom";
import { ToastProvider } from "@/components/Toast";
import { AiQueueProvider } from "@/components/AiQueue";
import type { ReactElement } from "react";

interface Options extends Omit<RenderOptions, "wrapper"> {
  routerProps?: MemoryRouterProps;
}

export function renderWithProviders(ui: ReactElement, options: Options = {}) {
  const { routerProps, ...renderOptions } = options;

  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <MemoryRouter {...routerProps}>
        <ToastProvider>
          <AiQueueProvider>{children}</AiQueueProvider>
        </ToastProvider>
      </MemoryRouter>
    );
  }

  return render(ui, { wrapper: Wrapper, ...renderOptions });
}
