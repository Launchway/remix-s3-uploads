import { ALLOWED_FILE_TYPES } from "~/constants";

export const FileLimits = () => {
  return (
    <>
      <p className="text-sm text-gray-600">
        Only {ALLOWED_FILE_TYPES.join(",")} files are allowed. Maximum file
        size: 1KB.
      </p>
      <p className="text-sm text-gray-600">
        Note: Uploaded files will be cleared regularly.
      </p>
    </>
  );
};
