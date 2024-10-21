import { getBucketPathPrefix } from "~/lib/uploads";

export const UserSessionInfo = ({ userId }: { userId: string }) => {
  return (
    <div>
      <h2 className="text-xl font-semibold mb-2">User ID</h2>
      <p className="mb-3">
        <span className="font-mono bg-gray-100 px-2 py-1 rounded">
          {userId}
        </span>
      </p>
      <p className="text-sm text-gray-600">
        Files will be uploaded to the path: {getBucketPathPrefix(userId)}
      </p>
    </div>
  );
};
