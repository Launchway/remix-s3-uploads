import { formatDate } from "~/lib/date";
import { UploadedFile } from "~/types";

export const UploadedFilesList = ({
  uploadedFiles,
}: {
  uploadedFiles: UploadedFile[];
}) => {
  return (
    <div className="bg-white ">
      <h2 className="text-2xl font-semibold mb-4">Your Uploaded Files</h2>
      {uploadedFiles && uploadedFiles.length > 0 ? (
        <ul className="space-y-2">
          {uploadedFiles.map(
            (
              file: {
                key: string;
                url: string;
                uploadedAt: string;
                originalFileName: string;
                presignedUrl: string;
              },
              index: number
            ) => (
              <li key={index} className="flex items-center">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5 mr-2 text-gray-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                <div>
                  <a
                    href={file.presignedUrl}
                    download={file.originalFileName}
                    className="text-blue-500 hover:text-blue-700 font-medium"
                  >
                    {file.originalFileName}
                  </a>
                  <span className="text-sm text-gray-600 ml-2">
                    (Uploaded on: {formatDate(file.uploadedAt)})
                  </span>
                </div>
              </li>
            )
          )}
        </ul>
      ) : (
        <p className="text-gray-600">No files uploaded yet.</p>
      )}
    </div>
  );
};
