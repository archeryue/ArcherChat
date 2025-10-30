"use client";

import { UserStats as UserStatsType } from "@/types";

interface UserStatsProps {
  users: UserStatsType[];
}

export function UserStats({ users }: UserStatsProps) {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-bold mb-4">User Statistics</h2>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b">
              <th className="text-left py-2 px-3">Email</th>
              <th className="text-left py-2 px-3">Name</th>
              <th className="text-center py-2 px-3">Messages</th>
              <th className="text-left py-2 px-3">Last Active</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.email} className="border-b hover:bg-gray-50">
                <td className="py-2 px-3 font-medium">{user.email}</td>
                <td className="py-2 px-3">{user.name}</td>
                <td className="py-2 px-3 text-center">
                  <span className="inline-flex items-center justify-center w-12 h-8 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
                    {user.message_count}
                  </span>
                </td>
                <td className="py-2 px-3 text-sm text-gray-600">
                  {new Date(user.last_active).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {users.length === 0 && (
        <p className="text-center py-8 text-gray-500">No users yet</p>
      )}

      <div className="mt-4 pt-4 border-t">
        <div className="flex justify-between text-sm">
          <span className="font-medium">Total Users:</span>
          <span>{users.length}</span>
        </div>
        <div className="flex justify-between text-sm mt-1">
          <span className="font-medium">Total Messages:</span>
          <span>
            {users.reduce((sum, user) => sum + user.message_count, 0)}
          </span>
        </div>
      </div>
    </div>
  );
}
