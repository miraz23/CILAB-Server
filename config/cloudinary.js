const { v2: cloudinary } = require('cloudinary');

function configureCloudinary() {
  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
    throw new Error('Cloudinary configuration is incomplete. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.');
  }

  cloudinary.config({
    cloud_name: CLOUDINARY_CLOUD_NAME,
    api_key: CLOUDINARY_API_KEY,
    api_secret: CLOUDINARY_API_SECRET,
    secure: true,
  });
}

function uploadBuffer(buffer, options) {
  configureCloudinary();
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (error, result) => {
      if (error) return reject(error);
      resolve(result);
    });
    stream.end(buffer);
  });
}

function getOriginalFilename(filename) {
  const basename = String(filename || 'upload').split(/[\\/]/).pop() || 'upload';
  return basename.replace(/[?#%"'\r\n]/g, '_');
}

function destroyResource(publicId, options = {}) {
  configureCloudinary();
  return new Promise((resolve, reject) => {
    cloudinary.uploader.destroy(publicId, options, (error, result) => {
      if (error) return reject(error);
      resolve(result);
    });
  });
}

function getSignedDeliveryUrl(publicId, options = {}) {
  configureCloudinary();
  return cloudinary.url(publicId, {
    resource_type: 'raw',
    type: 'upload',
    secure: true,
    sign_url: true,
    ...options,
  });
}

function getPrivateDownloadUrl(publicId) {
  configureCloudinary();
  return cloudinary.utils.private_download_url(publicId, null, {
    resource_type: 'raw',
    type: 'upload',
    attachment: false,
  });
}

function createDirectUploadSignature(params) {
  configureCloudinary();
  return cloudinary.utils.api_sign_request(params, process.env.CLOUDINARY_API_SECRET);
}

module.exports = {
  cloudinary,
  configureCloudinary,
  uploadBuffer,
  destroyResource,
  getOriginalFilename,
  getSignedDeliveryUrl,
  getPrivateDownloadUrl,
  createDirectUploadSignature,
};
