// Simple Cloudinary-aware media URL resolver for SkillLink
// Usage: SLMedia.resolveUrl(url, cloudinaryId)
(function(){
  function isHttp(u){ return typeof u === 'string' && /^https?:\/\//i.test(u); }
  function apiHost(){
    try { if (typeof API_BASE === 'string' && API_BASE) return API_BASE.replace(/\/$/, '').replace(/\/api$/, ''); } catch(_){ }
    var meta = document.querySelector('meta[name="sl-api-base"]');
    var base = (meta && meta.content) || 'https://skill-link-gg2c.onrender.com/api';
    return base.replace(/\/$/, '').replace(/\/api$/, '');
  }
  function getCloudinaryBase(){
    var explicit = document.querySelector('meta[name="sl-cloudinary-base"]');
    if (explicit && explicit.content) return explicit.content.replace(/\/$/, '');
    var cloud = document.querySelector('meta[name="sl-cloudinary-cloud"]');
    var name = cloud && cloud.content;
    if (!name) return '';
    return 'https://res.cloudinary.com/' + name + '/image/upload';
  }
  function isCloudinary(u){ return isHttp(u) && /res\.cloudinary\.com\//i.test(u); }
  function resolveFromId(id){ var base = getCloudinaryBase(); if (!id) return ''; if (!base) return id; if (id.charAt(0) === '/') id = id.slice(1); return base + '/' + id; }
  function resolveUrl(u, cloudinaryId){
    if (u && isCloudinary(u)) return u; // already a cloudinary URL
    if (!u && cloudinaryId) return resolveFromId(cloudinaryId);
    if (isHttp(u)){
      // If this is an absolute URL from our API host and uses legacy /uploads, keep it; otherwise return as-is
      try {
        var host = apiHost(); var url = new URL(u);
        if (url.origin === host && /^\/uploads\//i.test(url.pathname)) return u; // already absolute to our host
        return u; // some other absolute URL
      } catch(_){ return u; }
    }
    if (!u && !cloudinaryId) return '';
    // Legacy: relative uploads path from API
    if (u && /^\/?uploads\//i.test(u)){
      if (u.charAt(0) !== '/') u = '/' + u; return apiHost() + u;
    }
    // If we have a Cloudinary public ID, build from it
    if (cloudinaryId) return resolveFromId(cloudinaryId);
    // If we have a non-empty relative path, prefix API host
    if (u){ if (u.charAt(0) !== '/') u = '/' + u; return apiHost() + u; }
    return '';
  }

  // small helper to set background-image after verifying it loads
  function setBgIfLoaded(el, url){ if(!el||!url) return; var img=new Image(); img.onload=function(){ el.style.backgroundImage="url('"+url+"')"; el.style.backgroundSize='cover'; el.style.backgroundPosition='center'; }; img.src=url; }

  window.SLMedia = { resolveUrl: resolveUrl, setBgIfLoaded: setBgIfLoaded };
})();
