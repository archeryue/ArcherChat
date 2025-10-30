import { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { db, COLLECTIONS } from "./firebase-admin";

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  pages: {
    signIn: "/login",
    error: "/login",
  },
  callbacks: {
    async signIn({ user, account, profile }) {
      if (!user.email) {
        return false;
      }

      const adminEmail = process.env.ADMIN_EMAIL;
      const isAdmin = user.email === adminEmail;

      // Check whitelist unless user is admin
      if (!isAdmin) {
        const whitelistDoc = await db
          .collection(COLLECTIONS.WHITELIST)
          .doc(user.email)
          .get();

        if (!whitelistDoc.exists) {
          // User not whitelisted
          return "/login?error=not_whitelisted";
        }
      }

      // Create or update user in Firestore
      const userRef = db.collection(COLLECTIONS.USERS).doc(user.id);
      const userDoc = await userRef.get();

      if (!userDoc.exists) {
        // New user
        await userRef.set({
          email: user.email,
          name: user.name || "",
          avatar_url: user.image || "",
          is_admin: isAdmin,
          created_at: new Date(),
          last_login: new Date(),
        });
      } else {
        // Existing user - update last login
        await userRef.update({
          last_login: new Date(),
        });
      }

      return true;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub!;

        // Check if user is admin
        const adminEmail = process.env.ADMIN_EMAIL;
        session.user.isAdmin = session.user.email === adminEmail;
      }
      return session;
    },
    async jwt({ token, user, account }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
  },
  session: {
    strategy: "jwt",
  },
};
