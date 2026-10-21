/* Spring-rendered story previews share the public page's CSS and interaction code. */
(function(){
  'use strict';
  if(document.documentElement.dataset.storySource!=='spring')return;
  if(document.body.dataset.previewAnchor)location.hash=document.body.dataset.previewAnchor;
})();
