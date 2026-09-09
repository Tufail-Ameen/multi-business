export default function UserList({ users, onEdit, onDelete }) {
  if (!users.length) {
    return <p className="text-center textcklr py-4 mb-0">No users registered yet.</p>;
  }

  return (
    <>
      <div className="hidden lg:block overflow-x-auto">
        <table className="table table-striped">
          <thead>
            <tr>
              <th className="head-settings">#</th>
              <th className="head-settings">Name</th>
              <th className="head-settings">Phone No</th>
              <th className="head-settings">CNIC</th>
              <th className="head-settings">Email</th>
              <th className="head-settings">Gender</th>
              <th className="head-settings">Address</th>
              <th className="head-settings">Salary</th>
              <th className="head-settings">Options</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user, index) => (
              <tr key={`${user.email}-${index}`}>
                <td className="body-settings">{index + 1}</td>
                <td className="body-settings">
                  {user.firstName} {user.lastName}
                </td>
                <td className="body-settings">{user.phoneno}</td>
                <td className="body-settings">{user.cnic}</td>
                <td className="body-settings">{user.email}</td>
                <td className="body-settings">{user.gender}</td>
                <td className="body-settings">{user.address}</td>
                <td className="body-settings">{user.sallary}</td>
                <td className="body-settings">
                  <div className="flex gap-2">
                    <button
                      onClick={() => onEdit(index)}
                      type="button"
                      className="btn edit"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => onDelete(index)}
                      type="button"
                      className="btn delete"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="block lg:hidden">
        {users.map((user, index) => (
          <div key={`${user.email}-${index}`} className="data-card mb-3">
            <p className="mb-2">
              <strong className="text-accent">Name:</strong>
              <span className="ms-2">
                {user.firstName} {user.lastName}
              </span>
            </p>
            <p className="mb-2">
              <strong className="text-accent">Email:</strong>
              <span className="ms-2">{user.email}</span>
            </p>
            <div className="grid grid-cols-12">
              <div className="col-span-6 mb-2">
                <strong className="text-accent">Phone:</strong>
                <span className="ms-2">{user.phoneno}</span>
              </div>
              <div className="col-span-6 mb-2">
                <strong className="text-accent">Gender:</strong>
                <span className="ms-2">{user.gender}</span>
              </div>
            </div>
            <p className="mb-2">
              <strong className="text-accent">CNIC:</strong>
              <span className="ms-2">{user.cnic}</span>
            </p>
            <p className="mb-2">
              <strong className="text-accent">Address:</strong>
              <span className="ms-2">{user.address}</span>
            </p>
            <p className="mb-3">
              <strong className="text-accent">Salary:</strong>
              <span className="ms-2">{user.sallary}</span>
            </p>
            <div className="flex gap-2">
              <button type="button" className="btn edit flex-1" onClick={() => onEdit(index)}>
                Edit
              </button>
              <button
                type="button"
                className="btn delete flex-1"
                onClick={() => onDelete(index)}
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
