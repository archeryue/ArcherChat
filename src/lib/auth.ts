import { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import { db, COLLECTIONS } from "./firebase-admin";

/**
 * Check if running on localhost (for test auth provider)
 * SECURITY: Test auth provider ONLY works on localhost
 */
function isLocalhost(): boolean {
  // Check for any deployment environment indicators
  // If any are present, we're NOT on localhost
  return (
    !process.env.VERCEL_URL &&
    !process.env.RAILWAY_STATIC_URL &&
    !process.env.RENDER_EXTERNAL_URL &&
    !process.env.GOOGLE_CLOUD_PROJECT
    // Note: We don't check PORT because localhost can also use 8080
  );
}

// Build providers array
const providers: any[] = [
  GoogleProvider({
    clientId: process.env.GOOGLE_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
  }),
];

// Add test provider ONLY on localhost in development mode
// SECURITY: Triple-guard system prevents production use
if (
  process.env.NODE_ENV === 'development' &&
  process.env.ENABLE_TEST_AUTH === 'true' &&
  isLocalhost()
) {
  providers.push(
    CredentialsProvider({
      id: 'test-provider',
      name: 'Test User',
      credentials: {},
      async authorize() {
        // Double-check localhost at runtime
        if (!isLocalhost()) {
          throw new Error('Test provider only available on localhost');
        }

        // Return predefined test user
        return {
          id: process.env.TEST_USER_ID || 'test-user-123',
          email: process.env.TEST_USER_EMAIL || 'test@example.com',
          name: process.env.TEST_USER_NAME || 'Test User',
        };
      },
    })
  );
}

export const authOptions: NextAuthOptions = {
  providers,
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

        // Include avatar from token
        if (token.picture) {
          session.user.image = token.picture as string;
        }
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
