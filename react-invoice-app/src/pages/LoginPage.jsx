import { faEye, faEyeSlash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { ErrorMessage, Field, Form, Formik } from "formik";
import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import * as Yup from "yup";
import { useAuth } from "../auth/AuthContext";
import AuthShell from "../components/auth/AuthShell";
import { isPlatformAdminUser } from "../lib/permissions";
import { getErrorMessage } from "../lib/rtkBaseQuery";

const schema = Yup.object({
  email: Yup.string().email("Invalid email").required("Email required"),
  password: Yup.string().required("Password required"),
});

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const from = location.state?.from?.pathname;

  return (
    <AuthShell
      eyebrow="Welcome back"
      title="Sign in to your account"
      description="Enter your credentials to access your secure business workspace."
      footer={
        <p>
          New to Invoice App? <Link to="/register">Create a business account</Link>
        </p>
      }
    >
      <Formik
        initialValues={{ email: "", password: "" }}
        validationSchema={schema}
        onSubmit={async (values) => {
          setSubmitting(true);
          try {
            const user = await login(values.email, values.password);
            toast.success("Welcome back");
            const isPlatformAdmin = isPlatformAdminUser(user);
            const requestedPath = from && from !== "/login" ? from : null;
            const canReturnToRequestedPath =
              requestedPath &&
              (isPlatformAdmin || !requestedPath.startsWith("/platform"));
            const fallback = isPlatformAdmin ? "/platform/businesses" : "/invoices";
            navigate(canReturnToRequestedPath ? requestedPath : fallback, {
              replace: true,
            });
          } catch (err) {
            toast.error(getErrorMessage(err, "Login failed"));
          } finally {
            setSubmitting(false);
          }
        }}
      >
        <Form className="auth-form">
          <div className="auth-field">
            <label htmlFor="email">Email address</label>
            <Field
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@company.com"
            />
            <ErrorMessage name="email" component="div" className="auth-field-error" />
          </div>
          <div className="auth-field">
            <div className="auth-label-row">
              <label htmlFor="password">Password</label>
              <span>Minimum 8 characters</span>
            </div>
            <div className="auth-password-wrap">
              <Field
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder="Enter your password"
              />
              <button
                type="button"
                className="auth-password-toggle"
                onClick={() => setShowPassword((visible) => !visible)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
              >
                <FontAwesomeIcon icon={showPassword ? faEyeSlash : faEye} />
              </button>
            </div>
            <ErrorMessage name="password" component="div" className="auth-field-error" />
          </div>
          <button type="submit" className="auth-submit" disabled={submitting}>
            {submitting ? "Signing you in…" : "Sign in"}
          </button>
          <p className="auth-admin-note">
            Platform administrators use the same secure sign-in.
          </p>
        </Form>
      </Formik>
    </AuthShell>
  );
}
