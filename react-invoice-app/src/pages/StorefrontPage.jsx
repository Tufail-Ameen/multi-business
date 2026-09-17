import { faArrowUpRightFromSquare, faCopy } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { ErrorMessage, Field, Form, Formik } from "formik";
import { useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { toast } from "react-toastify";
import * as Yup from "yup";
import ContactField from "../components/ui/ContactField";
import { contactSchema } from "../lib/validation";
import { copyText } from "../lib/rateLists";
import { getErrorMessage } from "../lib/rtkBaseQuery";
import { landingUrlFromSlug, storefrontToForm } from "../lib/storefront";
import {
  useGetStorefrontQuery,
  useUpdateStorefrontMutation,
} from "../services/invoiceApi";

const optionalUrl = Yup.string()
  .trim()
  .test(
    "url",
    "Use an http(s) URL or a path starting with /",
    (value) => !value || /^https?:\/\//i.test(value) || value.startsWith("/")
  );

const schema = Yup.object({
  published: Yup.boolean(),
  logoUrl: optionalUrl,
  coverUrl: optionalUrl,
  storyImageUrl: optionalUrl,
  showcase1ImageUrl: optionalUrl,
  showcase2ImageUrl: optionalUrl,
  showcase3ImageUrl: optionalUrl,
  showcase4ImageUrl: optionalUrl,
  instagramUrl: optionalUrl,
  facebookUrl: optionalUrl,
  primaryColor: Yup.string()
    .trim()
    .matches(/^$|^#[0-9a-fA-F]{6}$/, "Use a hex color like #c45c7a"),
  eyebrow: Yup.string().trim().max(80, "Max 80 characters"),
  heroTitle: Yup.string().trim().max(120, "Max 120 characters"),
  heroSubtitle: Yup.string().trim().max(280, "Max 280 characters"),
  ctaLabel: Yup.string().trim().max(40, "Max 40 characters"),
  storyTitle: Yup.string().trim().max(120, "Max 120 characters"),
  about: Yup.string().trim().max(2000, "Max 2000 characters"),
  highlight1Title: Yup.string().trim().max(80),
  highlight1Text: Yup.string().trim().max(220),
  highlight2Title: Yup.string().trim().max(80),
  highlight2Text: Yup.string().trim().max(220),
  highlight3Title: Yup.string().trim().max(80),
  highlight3Text: Yup.string().trim().max(220),
  showcase1Title: Yup.string().trim().max(80),
  showcase1Text: Yup.string().trim().max(160),
  showcase2Title: Yup.string().trim().max(80),
  showcase2Text: Yup.string().trim().max(160),
  showcase3Title: Yup.string().trim().max(80),
  showcase3Text: Yup.string().trim().max(160),
  showcase4Title: Yup.string().trim().max(80),
  showcase4Text: Yup.string().trim().max(160),
  whatsapp: contactSchema({ label: "WhatsApp" }),
  phone: contactSchema({ label: "Phone" }),
  email: Yup.string()
    .trim()
    .test(
      "email",
      "Invalid email",
      (value) => !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
    ),
  address: Yup.string().trim().max(200, "Max 200 characters"),
  city: Yup.string().trim().max(80, "Max 80 characters"),
});

const fieldClass =
  "w-full min-h-11 rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 font-[inherit] text-[var(--color-text)] outline-none focus:border-[var(--color-primary)]";
const labelClass = "mb-1 block text-sm font-bold text-[var(--color-text)]";
const errorClass = "mt-1 text-sm text-[var(--color-danger)]";

export default function StorefrontPage() {
  const { data, isLoading, isError, error } = useGetStorefrontQuery();
  const [updateStorefront, saveState] = useUpdateStorefrontMutation();
  const initialValues = useMemo(
    () => storefrontToForm(data?.storefront),
    [data]
  );
  const publicUrl = data?.slug ? landingUrlFromSlug(data.slug) : null;
  const publicPath = data?.publicPath || (data?.slug ? `/b/${data.slug}` : null);

  useEffect(() => {
    if (isError) toast.error(getErrorMessage(error, "Storefront load nahi hua"));
  }, [isError, error]);

  const copyLink = async () => {
    if (!publicUrl) return;
    const ok = await copyText(publicUrl);
    toast[ok ? "success" : "error"](ok ? "Link copied" : "Copy failed");
  };

  return (
    <div className="page-wrap">
      <div className="invoices-header">
        <div>
          <p className="count-invoices-tect mb-1">
            Public landing for this business. Customers open this page — your team still uses the dashboard.
          </p>
          {publicUrl ? (
            <p className="textcklr mb-0 small">
              {publicUrl}
              {data?.storefront?.published ? " · live" : " · unpublished"}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn filter py-2 px-3" onClick={copyLink} disabled={!publicUrl}>
            <FontAwesomeIcon icon={faCopy} className="me-2" />
            Copy link
          </button>
          {publicPath && data?.storefront?.published ? (
            <Link to={publicPath} target="_blank" rel="noreferrer" className="btn save-changes py-2 px-3">
              <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="me-2" />
              View live page
            </Link>
          ) : null}
        </div>
      </div>

      {isLoading ? <p className="textcklr mt-4">Loading…</p> : null}

      {!isLoading && data ? (
        <Formik
          enableReinitialize
          initialValues={initialValues}
          validationSchema={schema}
          onSubmit={async (values) => {
            try {
              await updateStorefront(values).unwrap();
              toast.success(values.published ? "Landing published" : "Landing saved");
            } catch (err) {
              toast.error(getErrorMessage(err, "Save failed"));
            }
          }}
        >
          {({ values, setFieldValue }) => (
            <Form className="form-card mt-4 max-w-4xl">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-3">
                <div>
                  <p className="m-0 text-sm font-extrabold">Publish this page</p>
                  <p className="mb-0 mt-1 text-sm text-[var(--color-text-muted)]">
                    Off = only you see the editor. On = <code>/b/{data.slug}</code> is public.
                  </p>
                </div>
                <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-bold">
                  <input
                    type="checkbox"
                    checked={values.published}
                    onChange={(event) => setFieldValue("published", event.target.checked)}
                  />
                  {values.published ? "Published" : "Draft"}
                </label>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelClass} htmlFor="eyebrow">
                    Eyebrow
                  </label>
                  <Field id="eyebrow" name="eyebrow" className={fieldClass} placeholder="Lahore's favourite beauty store" />
                  <ErrorMessage name="eyebrow" component="div" className={errorClass} />
                </div>
                <div>
                  <label className={labelClass} htmlFor="ctaLabel">
                    Button label
                  </label>
                  <Field id="ctaLabel" name="ctaLabel" className={fieldClass} placeholder="Shop Now" />
                  <ErrorMessage name="ctaLabel" component="div" className={errorClass} />
                </div>
                <div>
                  <label className={labelClass} htmlFor="heroTitle">
                    Hero title
                  </label>
                  <Field id="heroTitle" name="heroTitle" className={fieldClass} placeholder={data.businessName} />
                  <ErrorMessage name="heroTitle" component="div" className={errorClass} />
                </div>
                <div>
                  <label className={labelClass} htmlFor="city">
                    City
                  </label>
                  <Field id="city" name="city" className={fieldClass} placeholder="Lahore" />
                  <ErrorMessage name="city" component="div" className={errorClass} />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelClass} htmlFor="heroSubtitle">
                    Short intro
                  </label>
                  <Field id="heroSubtitle" name="heroSubtitle" className={fieldClass} placeholder="Authentic cosmetics delivered to your door" />
                  <ErrorMessage name="heroSubtitle" component="div" className={errorClass} />
                </div>
                <div>
                  <label className={labelClass} htmlFor="storyTitle">
                    Story title
                  </label>
                  <Field id="storyTitle" name="storyTitle" className={fieldClass} placeholder="Our Story" />
                  <ErrorMessage name="storyTitle" component="div" className={errorClass} />
                </div>
                <div>
                  <label className={labelClass} htmlFor="primaryColor">
                    Brand color
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      aria-label="Pick brand color"
                      className="h-11 w-14 cursor-pointer rounded-[12px] border border-[var(--color-border)] bg-white p-1"
                      value={values.primaryColor || "#c45c7a"}
                      onChange={(event) => setFieldValue("primaryColor", event.target.value)}
                    />
                    <Field id="primaryColor" name="primaryColor" className={fieldClass} placeholder="#c45c7a" />
                  </div>
                  <ErrorMessage name="primaryColor" component="div" className={errorClass} />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelClass} htmlFor="about">
                    About / story
                  </label>
                  <Field as="textarea" id="about" name="about" rows="4" className={`${fieldClass} py-3`} />
                  <ErrorMessage name="about" component="div" className={errorClass} />
                </div>
                <div>
                  <label className={labelClass} htmlFor="highlight1Title">
                    Highlight 1 title
                  </label>
                  <Field id="highlight1Title" name="highlight1Title" className={fieldClass} placeholder="Authentic Products" />
                </div>
                <div>
                  <label className={labelClass} htmlFor="highlight1Text">
                    Highlight 1 text
                  </label>
                  <Field id="highlight1Text" name="highlight1Text" className={fieldClass} />
                </div>
                <div>
                  <label className={labelClass} htmlFor="highlight2Title">
                    Highlight 2 title
                  </label>
                  <Field id="highlight2Title" name="highlight2Title" className={fieldClass} placeholder="Fast Delivery" />
                </div>
                <div>
                  <label className={labelClass} htmlFor="highlight2Text">
                    Highlight 2 text
                  </label>
                  <Field id="highlight2Text" name="highlight2Text" className={fieldClass} />
                </div>
                <div>
                  <label className={labelClass} htmlFor="highlight3Title">
                    Highlight 3 title
                  </label>
                  <Field id="highlight3Title" name="highlight3Title" className={fieldClass} placeholder="Best Prices" />
                </div>
                <div>
                  <label className={labelClass} htmlFor="highlight3Text">
                    Highlight 3 text
                  </label>
                  <Field id="highlight3Text" name="highlight3Text" className={fieldClass} />
                </div>
                <div>
                  <label className={labelClass} htmlFor="whatsapp">
                    WhatsApp
                  </label>
                  <ContactField name="whatsapp" id="whatsapp" className={fieldClass} />
                  <ErrorMessage name="whatsapp" component="div" className={errorClass} />
                </div>
                <div>
                  <label className={labelClass} htmlFor="phone">
                    Phone
                  </label>
                  <ContactField name="phone" id="phone" className={fieldClass} />
                  <ErrorMessage name="phone" component="div" className={errorClass} />
                </div>
                <div>
                  <label className={labelClass} htmlFor="email">
                    Email
                  </label>
                  <Field id="email" name="email" type="email" className={fieldClass} />
                  <ErrorMessage name="email" component="div" className={errorClass} />
                </div>
                <div>
                  <label className={labelClass} htmlFor="instagramUrl">
                    Instagram URL
                  </label>
                  <Field id="instagramUrl" name="instagramUrl" className={fieldClass} placeholder="https://instagram.com/…" />
                  <ErrorMessage name="instagramUrl" component="div" className={errorClass} />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelClass} htmlFor="address">
                    Address
                  </label>
                  <Field id="address" name="address" className={fieldClass} />
                  <ErrorMessage name="address" component="div" className={errorClass} />
                </div>
                <div>
                  <label className={labelClass} htmlFor="logoUrl">
                    Logo URL
                  </label>
                  <Field id="logoUrl" name="logoUrl" className={fieldClass} placeholder="https://…" />
                  <ErrorMessage name="logoUrl" component="div" className={errorClass} />
                </div>
                <div>
                  <label className={labelClass} htmlFor="coverUrl">
                    Hero image URL
                  </label>
                  <Field id="coverUrl" name="coverUrl" className={fieldClass} placeholder="Lifestyle / shop photo, not a product pack" />
                  <ErrorMessage name="coverUrl" component="div" className={errorClass} />
                </div>
                <div>
                  <label className={labelClass} htmlFor="storyImageUrl">
                    Story image URL
                  </label>
                  <Field id="storyImageUrl" name="storyImageUrl" className={fieldClass} placeholder="https://…" />
                  <ErrorMessage name="storyImageUrl" component="div" className={errorClass} />
                </div>
                <p className="sm:col-span-2 mb-0 mt-2 text-sm font-extrabold">
                  Landing photos
                </p>
                <p className="sm:col-span-2 textcklr small mt-0">
                  These are marketing images for the landing page. Product pack shots stay on the store.
                </p>
                {[1, 2, 3, 4].map((slot) => (
                  <div key={slot} className="sm:col-span-2 grid gap-3 rounded-2xl border border-[var(--color-border)] p-3 sm:grid-cols-3">
                    <div>
                      <label className={labelClass} htmlFor={`showcase${slot}Title`}>
                        Card {slot} title
                      </label>
                      <Field
                        id={`showcase${slot}Title`}
                        name={`showcase${slot}Title`}
                        className={fieldClass}
                        placeholder={slot === 1 ? "Skincare" : slot === 2 ? "Makeup" : "Lifestyle"}
                      />
                    </div>
                    <div>
                      <label className={labelClass} htmlFor={`showcase${slot}Text`}>
                        Caption
                      </label>
                      <Field
                        id={`showcase${slot}Text`}
                        name={`showcase${slot}Text`}
                        className={fieldClass}
                        placeholder="Short line"
                      />
                    </div>
                    <div>
                      <label className={labelClass} htmlFor={`showcase${slot}ImageUrl`}>
                        Image URL
                      </label>
                      <Field
                        id={`showcase${slot}ImageUrl`}
                        name={`showcase${slot}ImageUrl`}
                        className={fieldClass}
                        placeholder="https://…"
                      />
                      <ErrorMessage
                        name={`showcase${slot}ImageUrl`}
                        component="div"
                        className={errorClass}
                      />
                    </div>
                  </div>
                ))}
                <div>
                  <label className={labelClass} htmlFor="facebookUrl">
                    Facebook URL
                  </label>
                  <Field id="facebookUrl" name="facebookUrl" className={fieldClass} placeholder="https://facebook.com/…" />
                  <ErrorMessage name="facebookUrl" component="div" className={errorClass} />
                </div>
              </div>

              <div className="mt-5 flex justify-end">
                <button
                  type="submit"
                  className="btn save-changes px-4 py-2"
                  disabled={saveState.isLoading}
                >
                  {saveState.isLoading ? "Saving…" : "Save landing page"}
                </button>
              </div>
            </Form>
          )}
        </Formik>
      ) : null}
    </div>
  );
}
