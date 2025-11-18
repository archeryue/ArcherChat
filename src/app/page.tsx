import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="text-center space-y-8 p-8">
        <h1 className="text-6xl font-bold">
          <span className="text-blue-600">Whim</span><span className="text-gray-900">Craft</span>
        </h1>
        <p className="text-xl text-gray-600 max-w-md">
          Your personal AI agent powered by Google Gemini
        </p>
        <div className="space-x-4">
          <Link
            href="/login"
            className="inline-block px-8 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Get Started
          </Link>
        </div>
      </div>
    </div>
  );
}
