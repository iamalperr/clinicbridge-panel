import { describe, it, expect } from "vitest";
import { 
  parseMillis, 
  getStartOfDay, 
  getRoleDisplayName, 
  calculateActivityStatus,
  canAdminViewUser
} from "../lib/services/analyticsService";
import type { UserProfile } from "../lib/types";

describe("Analytics Service Utilities", () => {
  describe("parseMillis", () => {
    it("should parse number milliseconds", () => {
      const now = 1770000000000;
      expect(parseMillis(now)).toBe(now);
    });

    it("should convert epoch seconds to milliseconds", () => {
      const seconds = 1770000000;
      expect(parseMillis(seconds)).toBe(1770000000000);
    });

    it("should parse Date instances", () => {
      const d = new Date(1770000000000);
      expect(parseMillis(d)).toBe(1770000000000);
    });

    it("should parse Firestore Timestamp objects with toMillis()", () => {
      const mockTimestamp = {
        toMillis: () => 1770000000000,
        toDate: () => new Date(1770000000000)
      };
      expect(parseMillis(mockTimestamp)).toBe(1770000000000);
    });

    it("should parse Firestore raw { _seconds, _nanoseconds }", () => {
      const rawTimestamp = {
        _seconds: 1770000000,
        _nanoseconds: 500000000
      };
      expect(parseMillis(rawTimestamp)).toBe(1770000000500);
    });

    it("should parse ISO date strings", () => {
      const iso = "2026-08-03T12:00:00.000Z";
      expect(parseMillis(iso)).toBe(Date.parse(iso));
    });

    it("should return null for invalid / missing values", () => {
      expect(parseMillis(null)).toBeNull();
      expect(parseMillis(undefined)).toBeNull();
      expect(parseMillis("not-a-date")).toBeNull();
      expect(parseMillis(-1)).toBeNull();
    });
  });

  describe("getStartOfDay", () => {
    it("should return timestamp for 00:00:00.000 of reference time", () => {
      const ref = new Date("2026-08-03T15:30:45.123Z").getTime();
      const startOfDay = getStartOfDay(ref);
      const startObj = new Date(startOfDay);
      expect(startObj.getHours()).toBe(0);
      expect(startObj.getMinutes()).toBe(0);
      expect(startObj.getSeconds()).toBe(0);
      expect(startObj.getMilliseconds()).toBe(0);
    });
  });

  describe("getRoleDisplayName", () => {
    it("should return correct Turkish labels for roles", () => {
      expect(getRoleDisplayName("superAdmin")).toBe("Super Admin");
      expect(getRoleDisplayName("admin")).toBe("Super Admin");
      expect(getRoleDisplayName("agencyAdmin")).toBe("Acente Yöneticisi");
      expect(getRoleDisplayName("agencyUser")).toBe("Acente Kullanıcısı");
      expect(getRoleDisplayName("clinicAdmin")).toBe("Klinik Yöneticisi");
      expect(getRoleDisplayName("clinicUser")).toBe("Klinik Kullanıcısı");
      expect(getRoleDisplayName("viewer")).toBe("Görüntüleyici");
      expect(getRoleDisplayName(undefined)).toBe("Kullanıcı");
    });
  });

  describe("calculateActivityStatus", () => {
    const now = 1770000000000;

    it("should return 'Hiç Giriş Yapmadı' when no activity or 0 logins", () => {
      expect(calculateActivityStatus(null, 0, now)).toBe("Hiç Giriş Yapmadı");
      expect(calculateActivityStatus(now, 0, now)).toBe("Hiç Giriş Yapmadı");
      expect(calculateActivityStatus(null, 5, now)).toBe("Hiç Giriş Yapmadı");
    });

    it("should return 'Aktif' for activity within last 5 minutes or 7 days", () => {
      const twoMinutesAgo = now - 2 * 60 * 1000;
      expect(calculateActivityStatus(twoMinutesAgo, 3, now)).toBe("Aktif");

      const threeDaysAgo = now - 3 * 24 * 60 * 60 * 1000;
      expect(calculateActivityStatus(threeDaysAgo, 3, now)).toBe("Aktif");
    });

    it("should return 'Düşük Kullanım' for activity between 7 and 30 days ago", () => {
      const fifteenDaysAgo = now - 15 * 24 * 60 * 60 * 1000;
      expect(calculateActivityStatus(fifteenDaysAgo, 2, now)).toBe("Düşük Kullanım");
    });

    it("should return 'Pasif' for activity older than 30 days", () => {
      const fortyDaysAgo = now - 40 * 24 * 60 * 60 * 1000;
      expect(calculateActivityStatus(fortyDaysAgo, 10, now)).toBe("Pasif");
    });
  });

  describe("Tenant Isolation (canAdminViewUser)", () => {
    const superAdmin: UserProfile = {
      uid: "sa-1",
      email: "sa@admin.com",
      name: "Super Admin",
      role: "superAdmin",
      status: "active",
      permissions: []
    };

    const clinicAdmin: UserProfile = {
      uid: "ca-1",
      email: "ca@clinic.com",
      name: "Clinic Admin",
      role: "clinicAdmin",
      clinicId: "clinic_123",
      status: "active",
      permissions: []
    };

    const agencyAdmin: UserProfile = {
      uid: "aa-1",
      email: "aa@agency.com",
      name: "Agency Admin",
      role: "agencyAdmin",
      agencyId: "agency_456",
      status: "active",
      permissions: []
    };

    const agencyClinicIds = new Set(["clinic_123", "clinic_999"]);

    it("Super Admin can view any user", () => {
      expect(canAdminViewUser(superAdmin, { clinicId: "clinic_123" })).toBe(true);
      expect(canAdminViewUser(superAdmin, { agencyId: "agency_456" })).toBe(true);
      expect(canAdminViewUser(superAdmin, { clinicId: undefined, agencyId: undefined })).toBe(true);
    });

    it("Clinic Admin can only view users belonging to their clinic", () => {
      expect(canAdminViewUser(clinicAdmin, { clinicId: "clinic_123" })).toBe(true);
      expect(canAdminViewUser(clinicAdmin, { clinicId: "clinic_other" })).toBe(false);
      expect(canAdminViewUser(clinicAdmin, { clinicId: undefined })).toBe(false);
    });

    it("Agency Admin can view agency users and affiliated clinic users", () => {
      expect(canAdminViewUser(agencyAdmin, { agencyId: "agency_456" }, agencyClinicIds)).toBe(true);
      expect(canAdminViewUser(agencyAdmin, { clinicId: "clinic_123" }, agencyClinicIds)).toBe(true);
      expect(canAdminViewUser(agencyAdmin, { clinicId: "unaffiliated_clinic" }, agencyClinicIds)).toBe(false);
    });
  });
});
