import { ErrorMessage, Field, Form, Formik } from "formik";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import * as Yup from "yup";
import { useAuth } from "../auth/AuthContext";
import AuthShell from "../components/auth/AuthShell";
import { getErrorMessage } from "../lib/rtkBaseQuery";

const schema = Yup.object({
  firstName: Yup.string().required("First name required"),
  lastName: Yup.string().required("Last name required"),
  email: Yup.string().email("Invalid email").required("Email required"),
  password: Yup.string().min(8, "Min 8 characters").required("Password required"),
  businessName: Yup.string().required("Business name required"),
});

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);

  return (
    <AuthShell
      register
      eyebrow="Start today"
      title="Create your business workspace"
      description="Set up your company account. You’ll become the Business Owner and can invite your team next."
      footer={
        <p>
          Already have an account? <Link to="/login">Sign in instead</Link>
        </p>
      }
    >
      <Formik
        initialValues={{
          firstName: "",
          lastName: "",
          email: "",
          password: "",
          businessName: "",
        }}
        validationSchema={schema}
        onSubmit={async (values) => {
          setSubmitting(true);
          try {
            await register(values);
            toast.success("Business workspace created");
            navigate("/invoices", { replace: true });
          } catch (err) {
            toast.error(getErrorMessage(err, "Register failed"));
          } finally {
            setSubmitting(false);
          }
        }}
      >
        <Form className="auth-form">
          <div className="auth-field-grid">
            <div className="auth-field">
              <label htmlFor="firstName">First name</label>
              <Field
                id="firstName"
                name="firstName"
                autoComplete="given-name"
                placeholder="First name"
              />
              <ErrorMessage name="firstName" component="div" className="auth-field-error" />
            </div>
            <div className="auth-field">
              <label htmlFor="lastName">Last name</label>
              <Field
                id="lastName"
                name="lastName"
                autoComplete="family-name"
                placeholder="Last name"
              />
              <ErrorMessage name="lastName" component="div" className="auth-field-error" />
            </div>
          </div>
          <div className="auth-field">
            <label htmlFor="businessName">Business name</label>
            <Field
              id="businessName"
              name="businessName"
              autoComplete="organization"
              placeholder="e.g. Demo Traders"
            />
            <ErrorMessage name="businessName" component="div" className="auth-field-error" />
          </div>
          <div className="auth-field">
            <label htmlFor="email">Work email</label>
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
              <span>At least 8 characters</span>
            </div>
            <Field
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              placeholder="Create a strong password"
            />
            <ErrorMessage name="password" component="div" className="auth-field-error" />
          </div>
          <button type="submit" className="auth-submit" disabled={submitting}>
            {submitting ? "Creating your workspace…" : "Create business account"}
          </button>
          <p className="auth-terms">
            This registration creates a Business Owner account. Platform Admin
            accounts are provisioned separately.
          </p>
        </Form>
      </Formik>
    </AuthShell>
  );
}
