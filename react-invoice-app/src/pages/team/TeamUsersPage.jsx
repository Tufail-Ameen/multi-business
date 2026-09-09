import { faCirclePlus, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { ErrorMessage, Field, Form, Formik } from "formik";
import { useEffect, useState } from "react";
import { toast } from "react-toastify";
import Swal from "sweetalert2";
import * as Yup from "yup";
import { useAuth } from "../../auth/AuthContext";
import { Can } from "../../auth/guards";
import EmptyState from "../../components/ui/EmptyState";
import { PERMISSIONS } from "../../lib/permissions";
import { getErrorMessage } from "../../lib/rtkBaseQuery";
import {
  useGetRolesQuery,
  useGetUsersQuery,
  useInviteUserMutation,
  useRemoveUserMutation,
  useUpdateUserMutation,
} from "../../services/invoiceApi";

const inviteSchema = Yup.object({
  firstName: Yup.string().required("Required"),
  lastName: Yup.string().required("Required"),
  email: Yup.string().email().required("Required"),
  password: Yup.string().min(8).required("Required"),
  roleId: Yup.string().required("Role chunein"),
});

/**
 * Business Owner / Admin — team invite + role assign.
 * Backend: GET/POST/PATCH/DELETE /users (X-Business-Id scoped)
 */
export default function TeamUsersPage() {
  const { user: currentUser, activeBusiness } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const { data, isLoading, isError, error, refetch } = useGetUsersQuery();
  const { data: rolesData } = useGetRolesQuery();
  const [inviteUser] = useInviteUserMutation();
  const [updateUser] = useUpdateUserMutation();
  const [removeUser] = useRemoveUserMutation();

  const users = data?.users || data?.items || [];
  const roles = (rolesData?.roles || rolesData?.items || []).filter(
    (r) => r.slug !== "platform_super_admin"
  );

  useEffect(() => {
    if (isError) toast.error(getErrorMessage(error, "Users load nahi hue"));
  }, [isError, error]);

  const onRemove = async (member) => {
    const result = await Swal.fire({
      title: "Remove from business?",
      text: member.email,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Remove",
    });
    if (!result.isConfirmed) return;
    try {
      await removeUser(member.id).unwrap();
      toast.success("Removed");
    } catch (err) {
      toast.error(getErrorMessage(err, "Remove fail"));
    }
  };

  return (
    <div className="page-wrap">
      <div className="invoices-header">
        <p className="count-invoices-tect mb-0">
          {activeBusiness?.name || "Business"} — staff invite aur role assign.
        </p>
        <Can permission={PERMISSIONS.USERS_INVITE}>
          <button type="button" className="btn new-invoice" onClick={() => setShowForm(true)}>
            <span className="circle-plus me-2">
              <FontAwesomeIcon icon={faCirclePlus} />
            </span>
            Invite user
          </button>
        </Can>
      </div>

      {isLoading && <p className="textcklr mt-4">Loading…</p>}

      {!isLoading && !users.length && (
        <EmptyState
          title="Team empty"
          message="Backend /users ready hone ke baad members yahan dikhenge."
        />
      )}

      <div className="overflow-x-auto data-card mt-3 p-0">
        <table className="table mb-0 rbac-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {users.map((member, index) => (
              <tr key={member.id}>
                <td>{index + 1}</td>
                <td>{member.fullName || `${member.firstName} ${member.lastName}`}</td>
                <td>{member.email}</td>
                <td>{member.role?.name || "—"}</td>
                <td>
                  <span className={`rbac-status-pill status-${member.status || "active"}`}>
                    {member.status || "active"}
                  </span>
                </td>
                <td className="text-end">
                  <Can permission={PERMISSIONS.USERS_UPDATE}>
                    <select
                      className="form-select text-sm inline-block w-auto me-2"
                      value={member.role?.id || ""}
                      onChange={async (e) => {
                        try {
                          await updateUser({ id: member.id, roleId: e.target.value }).unwrap();
                          toast.success("Role updated");
                        } catch (err) {
                          toast.error(getErrorMessage(err, "Update fail"));
                        }
                      }}
                    >
                      {roles.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  </Can>
                  <Can permission={PERMISSIONS.USERS_DELETE}>
                    {member.id !== currentUser?.id && (
                      <button
                        type="button"
                        className="btn text-sm text-red-600"
                        onClick={() => onRemove(member)}
                        title="Remove"
                      >
                        <FontAwesomeIcon icon={faTrash} />
                      </button>
                    )}
                  </Can>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div className="rbac-modal-backdrop" onClick={() => setShowForm(false)}>
          <div className="form-card rbac-modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="page-title mb-3" style={{ fontSize: "1.35rem" }}>
              Invite team member
            </h2>
            <Formik
              initialValues={{
                firstName: "",
                lastName: "",
                email: "",
                password: "Password123!",
                roleId: roles[0]?.id || "",
              }}
              validationSchema={inviteSchema}
              onSubmit={async (values, { setSubmitting }) => {
                try {
                  await inviteUser(values).unwrap();
                  toast.success("User invited");
                  setShowForm(false);
                  refetch();
                } catch (err) {
                  toast.error(getErrorMessage(err, "Invite fail"));
                } finally {
                  setSubmitting(false);
                }
              }}
            >
              {({ isSubmitting }) => (
                <Form>
                  <div className="grid grid-cols-12 gap-2">
                    <div className="md:col-span-6">
                      <label className="form-label input-clr">First name</label>
                      <Field name="firstName" className="form-control input-settings" />
                      <ErrorMessage name="firstName" component="div" className="text-red-600" />
                    </div>
                    <div className="md:col-span-6">
                      <label className="form-label input-clr">Last name</label>
                      <Field name="lastName" className="form-control input-settings" />
                      <ErrorMessage name="lastName" component="div" className="text-red-600" />
                    </div>
                  </div>
                  <div className="mb-3 mt-2">
                    <label className="form-label input-clr">Email</label>
                    <Field name="email" type="email" className="form-control input-settings" />
                    <ErrorMessage name="email" component="div" className="text-red-600" />
                  </div>
                  <div className="mb-3">
                    <label className="form-label input-clr">Temp password</label>
                    <Field name="password" type="password" className="form-control input-settings" />
                    <ErrorMessage name="password" component="div" className="text-red-600" />
                  </div>
                  <div className="mb-3">
                    <label className="form-label input-clr">Role</label>
                    <Field as="select" name="roleId" className="form-select input-settings">
                      <option value="">Select role</option>
                      {roles.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </Field>
                    <ErrorMessage name="roleId" component="div" className="text-red-600" />
                  </div>
                  <div className="flex justify-end gap-2">
                    <button type="button" className="btn filter" onClick={() => setShowForm(false)}>
                      Cancel
                    </button>
                    <button type="submit" className="btn new-invoice" disabled={isSubmitting}>
                      {isSubmitting ? "Saving…" : "Invite"}
                    </button>
                  </div>
                </Form>
              )}
            </Formik>
          </div>
        </div>
      )}
    </div>
  );
}
