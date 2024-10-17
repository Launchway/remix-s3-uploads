import awsLogo from "~/images/s3.png";
import cloudflareLogo from "~/images/cloudflare.png";

export const UploadDestinationToggle = ({
  useCloudflare,
  handleToggleCloudflare,
}: {
  useCloudflare: boolean;
  handleToggleCloudflare: () => void;
}) => {
  return (
    <div className="flex items-center">
      <img src={awsLogo} alt="AWS S3" className="h-8 mr-2" />
      <div className="flex items-center cursor-pointer">
        <div className="relative">
          <input
            type="checkbox"
            className="sr-only"
            checked={useCloudflare}
            onChange={handleToggleCloudflare}
          />
          <div
            className={`block w-14 h-8 rounded-full ${
              useCloudflare ? "bg-blue-500" : "bg-gray-300"
            }`}
          ></div>
          <div
            className={`dot absolute left-1 top-1 bg-white w-6 h-6 rounded-full transition ${
              useCloudflare ? "transform translate-x-6" : ""
            }`}
          ></div>
        </div>
      </div>
      <img src={cloudflareLogo} alt="Cloudflare R2" className="h-8 ml-2" />
    </div>
  );
};
