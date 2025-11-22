"use client";

import { Suspense, useEffect, useState } from "react";
import { signIn, getProviders } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { LiteralUnion, ClientSafeProvider } from "next-auth/react";
import type { BuiltInProviderType } from "next-auth/providers";

function LoginContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  const [providers, setProviders] = useState<Record<LiteralUnion<BuiltInProviderType>, ClientSafeProvider> | null>(null);

  useEffect(() => {
    getProviders().then(setProviders);
  }, []);

  return (
    <div className="bg-white p-8 rounded-lg shadow-lg max-w-md w-full space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold">Welcome to <span className="text-blue-600">Whim</span><span className="text-slate-900">Craft</span></h1>
        <p className="text-slate-600 mt-2">Sign in to start chatting with AI</p>
      </div>

      {error === "not_whitelisted" && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          <p className="font-medium">Access Denied</p>
          <p className="text-sm">Your email is not whitelisted. Please contact the administrator.</p>
        </div>
      )}

      {error && error !== "not_whitelisted" && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          <p className="text-sm">An error occurred during sign in. Please try again.</p>
        </div>
      )}

      {providers && Object.values(providers).map((provider) => (
        <Button
          key={provider.id}
          onClick={() => signIn(provider.id, { callbackUrl: "/chat" })}
          className="w-full flex items-center justify-center gap-3"
          size="lg"
        >
          {provider.id === "google" && (
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                fill="currentColor"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="currentColor"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="currentColor"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="currentColor"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
          )}
          Sign in with {provider.name}
        </Button>
      ))}

      {!providers && <div className="text-center text-slate-500">Loading...</div>}

      <p className="text-xs text-slate-500 text-center">
        Only whitelisted users can access this application
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <Suspense fallback={
        <div className="bg-white p-8 rounded-lg shadow-lg max-w-md w-full space-y-6">
          <div className="text-center">
            <h1 className="text-3xl font-bold">Welcome to <span className="text-blue-600">Whim</span><span className="text-slate-900">Craft</span></h1>
            <p className="text-slate-600 mt-2">Sign in to start chatting with AI</p>
          </div>
        </div>
      }>
        <LoginContent />
      </Suspense>
    </div>
  );
}
