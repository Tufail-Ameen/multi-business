import { render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import App from "./App";
import { store } from "./app/store";

jest.mock("./lib/apiClient", () => ({
  api: jest.fn(),
  ApiError: class ApiError extends Error {},
  onSessionExpired: jest.fn(() => jest.fn()),
}));

jest.mock("./services/invoiceApi", () => {
  const mutation = () => [jest.fn()];
  return {
    invoiceApi: {
      reducerPath: "invoiceApi",
      reducer: (state = {}) => state,
      middleware: () => (next) => (action) => next(action),
      util: { resetApiState: jest.fn() },
    },
    useLazyMeQuery: mutation,
    useLoginMutation: mutation,
    useLogoutMutation: mutation,
    useRegisterMutation: mutation,
    useSwitchBusinessMutation: mutation,
  };
});

test("renders login when unauthenticated", async () => {
  render(
    <Provider store={store}>
      <App />
    </Provider>
  );
  const brands = await screen.findAllByText(/Invoice App/i);
  expect(brands.length).toBeGreaterThan(0);
});
