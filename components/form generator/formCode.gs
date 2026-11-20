function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no')
    .setTitle('Form Generator KKYP')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}