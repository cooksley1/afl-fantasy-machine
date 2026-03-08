import type { Express } from "express";
import { authStorage } from "./storage";
import { isAuthenticated } from "./replitAuth";

export function registerAuthRoutes(app: Express): void {
  app.get("/api/auth/user", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await authStorage.getUser(userId);
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }
      if (user.isBlocked) {
        return res.status(403).json({ message: "Your account has been suspended" });
      }

      const impersonateUserId = req.session?.impersonateUserId;
      let impersonating = null;
      if (impersonateUserId && user.isAdmin) {
        const impersonatedUser = await authStorage.getUser(impersonateUserId);
        if (impersonatedUser) {
          impersonating = {
            id: impersonatedUser.id,
            firstName: impersonatedUser.firstName,
            lastName: impersonatedUser.lastName,
            email: impersonatedUser.email,
          };
        }
      }

      res.json({ ...user, impersonating });
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });
}
