import {
  hasEveryUserPermission,
  hasUserPermission,
  isPlatformAdminUser,
  PERMISSIONS,
} from "./permissions";

describe("multi-tenant role permissions", () => {
  const businessOwner = {
    isPlatformAdmin: false,
    permissions: ["*"],
    activeBusinessId: "business-a",
  };

  const platformOwner = {
    isPlatformAdmin: true,
    permissions: ["*"],
  };

  test("business wildcard allows business features", () => {
    expect(
      hasUserPermission(businessOwner, PERMISSIONS.INVOICES_VIEW)
    ).toBe(true);
    expect(
      hasEveryUserPermission(businessOwner, [
        PERMISSIONS.CLIENTS_VIEW,
        PERMISSIONS.PRODUCTS_VIEW,
      ])
    ).toBe(true);
  });

  test("business wildcard does not grant platform management", () => {
    expect(isPlatformAdminUser(businessOwner)).toBe(false);
    expect(
      hasUserPermission(
        businessOwner,
        PERMISSIONS.PLATFORM_MANAGE_BUSINESSES
      )
    ).toBe(false);
  });

  test("platform flag grants platform management", () => {
    expect(isPlatformAdminUser(platformOwner)).toBe(true);
    expect(
      hasUserPermission(
        platformOwner,
        PERMISSIONS.PLATFORM_MANAGE_BUSINESSES
      )
    ).toBe(true);
  });

  test("explicit platform permission grants platform management", () => {
    const user = {
      isPlatformAdmin: false,
      permissions: [PERMISSIONS.PLATFORM_MANAGE_BUSINESSES],
    };

    expect(isPlatformAdminUser(user)).toBe(true);
    expect(
      hasUserPermission(user, PERMISSIONS.PLATFORM_MANAGE_BUSINESSES)
    ).toBe(true);
  });

  test("rate list permissions are in the catalog", () => {
    expect(PERMISSIONS.RATE_LISTS_VIEW).toBe("rate_lists.view");
    expect(
      hasUserPermission(
        { permissions: [PERMISSIONS.RATE_LISTS_SEND] },
        PERMISSIONS.RATE_LISTS_SEND
      )
    ).toBe(true);
    expect(
      hasUserPermission(
        { permissions: [PERMISSIONS.RATE_LISTS_VIEW] },
        PERMISSIONS.RATE_LISTS_SEND
      )
    ).toBe(false);
  });
});
