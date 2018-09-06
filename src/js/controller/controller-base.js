/**
 * Silex, live web creation
 * http://projects.silexlabs.org/?/silex/
 *
 * Copyright (c) 2012 Silex Labs
 * http://www.silexlabs.org/
 *
 * Silex is available under the GPL license
 * http://www.silexlabs.org/silex/silex-licensing/
 */

/**
 * @fileoverview In Silex, each UI of the view package,
 *      has a controller in the UI controller package which listens to its events,
 *      and call the main {silex.controller.Controller} controller's methods
 *      These UI controllers override the
 *      {silex.controller.ControllerBase} UiControllerBase class
 *
 */
goog.provide('silex.controller.ControllerBase');

goog.require('silex.utils.Notification');



/**
 * base class for all UI controllers of the controller package
 * @constructor
 * @param {silex.types.Model} model
 * @param  {silex.types.View} view  view class which holds the other views
 */
silex.controller.ControllerBase = function(model, view) {
  // store the model
  // store the model and the view
  /**
   * @type {silex.types.Model}
   */
  this.model = model;
  /**
   * @type {silex.types.View}
   */
  this.view = view;

  // init undo/redo
  this.undoReset();

  // tracker
  this.tracker = silex.service.Tracker.getInstance();


  // catchall error tracker
  window.onerror = /** @type {function (string, string, number)} */ ((msg, url, line, colno, error) => this.tracker.trackOnError(msg, url, line, colno, error));


  /**
   * invalidation mechanism
   * @type {InvalidationManager}
   */
  this.undoCheckpointInvalidationManager = new InvalidationManager(1000);
};

/**
 * {silex.service.Tracker} tracker used to pull statistics on the user actions
 * @see     silex.service.Tracker
 */
silex.controller.ControllerBase.prototype.tracker = null;


/**
 * @type {number} index of the undoHistory when last saved
 * this is useful in order to know if the website is "dirty", i.e. if it was modified since last save
 * it has a default value of -1
 * @see isDirty
 * @static because it is shared by all controllers
 */
silex.controller.ControllerBase.lastSaveUndoIdx = -1;


/**
 * @type {Array.<silex.types.UndoItem>} array of the states of the website
 * @static because it is shared by all controllers
 */
silex.controller.ControllerBase.undoHistory = [];


/**
 * @type {Array.<silex.types.UndoItem>} array of the states of the website
 * @static because it is shared by all controllers
 */
silex.controller.ControllerBase.redoHistory = [];


/**
 * @type {Array.<silex.types.ClipboardItem>}
 * @static because it is shared by all controllers
 */
silex.controller.ControllerBase.clipboard = null;


/**
 * flag to indicate that a getState ation is pending
 * will be 0 unless an undo check point is being created
 * @type {number}
 */
silex.controller.ControllerBase.getStatePending = 0;


/**
 * use lastSaveUndoIdx to determine if the website is dirty
 * @return {boolean} true if the website has unsaved changes
 */
silex.controller.ControllerBase.prototype.isDirty = function() {
  return silex.controller.ControllerBase.lastSaveUndoIdx !== silex.controller.ControllerBase.undoHistory.length - 1;
};



/**
 * store the model state in order to undo/redo
 */
silex.controller.ControllerBase.prototype.undoCheckPoint = function() {
  this.undoCheckpointInvalidationManager.callWhenReady(() => {
    silex.controller.ControllerBase.redoHistory = [];
    silex.controller.ControllerBase.getStatePending++;
    this.getStateAsync((state) => {
      silex.controller.ControllerBase.getStatePending--;
      // if the previous state was different
      if (silex.controller.ControllerBase.undoHistory.length === 0 ||
          silex.controller.ControllerBase.undoHistory[silex.controller.ControllerBase.undoHistory.length - 1].html !== state.html ||
          silex.controller.ControllerBase.undoHistory[silex.controller.ControllerBase.undoHistory.length - 1].page !== state.page) {
        silex.controller.ControllerBase.undoHistory.push(state);
      }
      else {
        console.warn('Did not store undo state, because nothing has changed');
      }
    });
  });
};



/**
 * build a state object for undo/redo
 * async operation to improve performance
 * @param {!function(silex.types.UndoItem)} opt_cbk
 */
silex.controller.ControllerBase.prototype.getStateAsync = function(opt_cbk) {
  this.model.file.getHtmlAsync((html) => {
    opt_cbk({
      html:html,
      page: this.model.page.getCurrentPage(),
      scrollX: this.view.stage.getScrollX(),
      scrollY: this.view.stage.getScrollY()
    });
  });
};



/**
 * build a state object for undo/redo
 * @return {silex.types.UndoItem}
 */
silex.controller.ControllerBase.prototype.getState = function() {
  return {
    html: this.model.file.getHtml(),
    page: this.model.page.getCurrentPage(),
    scrollX: this.view.stage.getScrollX(),
    scrollY: this.view.stage.getScrollY()
  };
};


/**
 * build a state object for undo/redo
 * @param {silex.types.UndoItem} state
 */
silex.controller.ControllerBase.prototype.restoreState = function(state) {
  this.model.file.setHtml(state.html, goog.bind(function() {
    this.model.page.setCurrentPage(state.page);
    this.view.stage.setScrollX(state.scrollX);
    this.view.stage.setScrollY(state.scrollY);
  }, this), false);
};


/**
 * reset the undo/redo history
 */
silex.controller.ControllerBase.prototype.undoReset = function() {
  silex.controller.ControllerBase.undoHistory = [];
  silex.controller.ControllerBase.redoHistory = [];
  silex.controller.ControllerBase.lastSaveUndoIdx = -1;
};


/**
 * open file explorer, choose an image and set it as the background image of the current selection
 */
silex.controller.ControllerBase.prototype.browseBgImage = function() {
  this.tracker.trackAction('controller-events', 'request', 'selectBgImage', 0);
  // open the file browser
  this.view.fileExplorer.openFile(FileExplorer.IMAGE_EXTENSIONS)
  .then(fileInfo => {
    if(fileInfo) {
      // update the model
      var element = this.model.body.getSelection()[0];
      // undo checkpoint
      this.undoCheckPoint();
      // load the image
      this.model.element.setBgImage(element, fileInfo.absPath);
      // tracking
      this.tracker.trackAction('controller-events', 'success', 'selectBgImage', 1);
    }
  })
  .catch(error => {
    silex.utils.Notification.notifyError('Error: I could not load the image. \n' + (error.message || ''));
    this.tracker.trackAction('controller-events', 'error', 'selectBgImage', -1);
  });
};


/**
 * open file explorer, choose an image and add it to the stage
 */
silex.controller.ControllerBase.prototype.browseAndAddImage = function() {
  this.tracker.trackAction('controller-events', 'request', 'insert.image', 0);
  this.view.fileExplorer.openFile(FileExplorer.IMAGE_EXTENSIONS)
  .then(fileInfo => {
    if(fileInfo) {
      // undo checkpoint
      this.undoCheckPoint();
      // create the element
      let img = this.addElement(silex.model.Element.TYPE_IMAGE);
      // load the image
      this.model.element.setImageUrl(img, fileInfo.absPath,
        (element, imgElement) => {
          this.tracker.trackAction('controller-events', 'success', 'insert.image', 1);
        },
        (element, message) => {
          silex.utils.Notification.notifyError('Error: I did not manage to load the image. \n' + message);
          this.model.element.removeElement(element);
          this.tracker.trackAction('controller-events', 'error', 'insert.image', -1);
        }
      );
    }
  })
  .catch(error => {
    silex.utils.Notification.notifyError('Error: I did not manage to load the image. \n' + (error.message || ''));
    this.tracker.trackAction('controller-events', 'error', 'insert.image', -1);
  });
  this.view.workspace.redraw(this.view);
};


/**
 * set a given style to the current selection
 * @param  {string} name
 * @param  {?string=} value
 * @param {?Array.<Element>=} opt_elements
 * @param  {?boolean=} opt_isUndoable default is true
 */
silex.controller.ControllerBase.prototype.styleChanged = function(name, value, opt_elements, opt_isUndoable) {
  if (!opt_elements) {
    opt_elements = this.model.body.getSelection();
  }
  if (opt_isUndoable !== false) {
    // undo checkpoint
    this.undoCheckPoint();
  }
  // apply the change to all elements
  goog.array.forEach(opt_elements, function(element) {
    // update the model
    this.model.element.setStyle(element, name, value);
  }, this);
  // refresh the view
  this.refreshView();
};


/**
 * set a set of styles to the current selection
 * @param  {Object|null} style
 * @param {?Array.<Element>=} opt_elements
 */
silex.controller.ControllerBase.prototype.multipleStylesChanged = function(style, opt_elements) {
  if (!opt_elements) {
    opt_elements = this.model.body.getSelection();
  }
  // undo checkpoint
  this.undoCheckPoint();
  // apply the change to all elements
  goog.array.forEach(opt_elements, function(element) {
    // update the model
    this.model.property.setStyle(element, style);
  }, this);
  // refresh the view
  this.refreshView();
};


/**
 * set a given property to the current selection
 * @param  {string} name
 * @param  {?string=} value
 * @param {?Array.<Element>=} opt_elements
 * @param {?boolean=} opt_applyToContent
 */
silex.controller.ControllerBase.prototype.propertyChanged = function(name, value, opt_elements, opt_applyToContent) {
  if (!opt_elements) {
    opt_elements = this.model.body.getSelection();
  }
  // undo checkpoint
  this.undoCheckPoint();
  // apply the change to all elements
  goog.array.forEach(opt_elements, function(element) {
    // update the model
    this.model.element.setProperty(element, name, value, opt_applyToContent);
  }, this);
  // refresh the view
  this.refreshView();
};


/**
 * set css class names
 * @param   {string} name
 */
silex.controller.ControllerBase.prototype.setClassName = function(name) {
  // undo checkpoint
  this.undoCheckPoint();
  // apply the change to all elements
  var elements = this.model.body.getSelection();
  goog.array.forEach(elements, function(element) {
    // update the model
    this.model.element.setClassName(element, name);
    // refresh the views
    this.view.breadCrumbs.redraw();
  }, this);
  // refresh the view
  this.refreshView();
};


/**
 * promp user for page name
 * used in insert page, rename page...
 * @param   {string} defaultName
 * @param   {function(string=, string=)} cbk
 */
silex.controller.ControllerBase.prototype.getUserInputPageName = function(defaultName, cbk) {
  silex.utils.Notification.prompt('Enter a name for your page!', defaultName,
      goog.bind(function(accept, name) {
        if (accept && name && name.length > 0) {
          // keep the full name
          var displayName = name;
          // cleanup the page name
          name = name.replace(/\W+/g, '-').toLowerCase();
          // do not allow to start with an dash or number (see css specifications)
          name = 'page-' + name;
          // check if a page with this name exists
          var pages = this.model.page.getPages();
          var exists = false;
          goog.array.forEach(pages, function(pageName) {
            if (pageName === name) {
              exists = true;
            }
          });
          if (exists) {
            // just open the new page
            this.openPage(name);
          }
          else {
            cbk(name, displayName);
          }
        }
        cbk();
      }, this));
};


/**
 * called after an element has been created
 * add the element to the current page (only if it has not a container which is in a page)
 * redraw the tools and set the element as editable
 * @param {Element} element the element to add
 */
silex.controller.ControllerBase.prototype.doAddElement = function(element) {
  // only visible on the current page
  var currentPageName = this.model.page.getCurrentPage();
  this.model.page.removeFromAllPages(element);
  this.model.page.addToPage(element, currentPageName);
  // unless one of its parents is in a page already
  this.checkElementVisibility(element);
  // select the component
  this.model.body.setSelection([element]);
};


/**
 * check if the element's parents belong to a page, and if one of them do,
 * remove the element from the other pages
 *
 * if the element is in a container which is visible only on some pages,
 * then the element should be visible everywhere, i.e. in the same pages as its parent
 * @param   {Element} element
 */
silex.controller.ControllerBase.prototype.checkElementVisibility = function(element) {
  var parentPage = this.model.page.getParentPage(element);
  if (parentPage !== null) {
    // get all the pages
    var pages = this.model.page.getPagesForElement(element);
    // remove the components from the page
    pages.forEach(pageName => this.model.page.removeFromPage(element, pageName));
  }
};


/**
 * ask the user for a new file title
 * @param {string} title
 */
silex.controller.ControllerBase.prototype.setTitle = function(title) {
  // undo checkpoint
  this.undoCheckPoint();
  this.model.head.setTitle(title);
};


/**
 * toggle advanced / apollo mode
 */
silex.controller.ControllerBase.prototype.toggleAdvanced = function() {
  if (!goog.dom.classlist.contains(document.body, 'advanced-mode-on')) {
    goog.dom.classlist.add(document.body, 'advanced-mode-on');
    goog.dom.classlist.remove(document.body, 'advanced-mode-off');
  }
  else {
    goog.dom.classlist.remove(document.body, 'advanced-mode-on');
    goog.dom.classlist.add(document.body, 'advanced-mode-off');
  }
};


/**
 * refresh tools after mobile/desktop editor switch
 */
silex.controller.ControllerBase.prototype.refreshView = function() {
  var pages = this.model.page.getPages();
  var currentPage = this.model.page.getCurrentPage();
  this.view.propertyTool.redraw(this.model.body.getSelection(), pages, currentPage);
};


/**
 * get mobile mode
 * @return {boolean} true if mobile mode is active
 */
silex.controller.ControllerBase.prototype.getMobileMode = function() {
  return this.view.workspace.getMobileEditor();
};


/**
 * set mobile mode
 * @param {boolean} isMobile
 */
silex.controller.ControllerBase.prototype.setMobileMode = function(isMobile) {
  this.view.workspace.setMobileEditor(isMobile);
  this.refreshView();
};


/**
 * toggle mobile mode
 */
silex.controller.ControllerBase.prototype.toggleMobileMode = function() {
  this.view.workspace.setMobileEditor(!this.view.workspace.getMobileEditor());
  this.refreshView();
};


/**
 * save or save-as
 * @param {?FileInfo=} opt_fileInfo
 * @param {?function()=} opt_cbk
 * @param {?function(*)=} opt_errorCbk
 */
silex.controller.ControllerBase.prototype.save = function(opt_fileInfo, opt_cbk, opt_errorCbk) {
  this.tracker.trackAction('controller-events', 'request', 'file.save', 0);
  if (opt_fileInfo && !this.model.file.isTemplate) {
    this.doSave(/** @type {FileInfo} */ (opt_fileInfo), opt_cbk, opt_errorCbk);
  }
  else {
    // choose a new name
    this.view.fileExplorer.saveAs('editable.html', FileExplorer.HTML_EXTENSIONS)
    .then(fileInfo => {
      if(fileInfo != null) {
        this.doSave(/** @type {FileInfo} */ (fileInfo), opt_cbk, opt_errorCbk);
      }
      else {
        console.log('user aborted save as');
      }
    })
    .catch(error => {
      this.tracker.trackAction('controller-events', 'error', 'file.save', -1);
      if (opt_errorCbk) {
        opt_errorCbk(error);
      }
    });
  }
};


/**
 * save or save-as
 * @param {FileInfo} fileInfo
 * @param {?function()=} opt_cbk
 * @param {?function(Object)=} opt_errorCbk
 */
silex.controller.ControllerBase.prototype.doSave = function(fileInfo, opt_cbk, opt_errorCbk) {
  // urls will be relative to the html file url
  this.model.file.fileInfo = fileInfo;
  // relative urls only in the files
  var rawHtml = this.model.file.getHtml();
  // look for bug of firefox inserting quotes in url("")
  if (rawHtml.indexOf('url(\'&quot;') > -1) {
    console.warn('I have found HTML entities in some urls, there us probably an error in the save process.');
    // log this (QA)
    this.tracker.trackAction('controller-events', 'warning', 'file.save.corrupted', -1);
    // try to cleanup the mess
    rawHtml = rawHtml.replace(/url\('&quot;()(.+?)\1&quot;'\)/gi, goog.bind(function(match, group1, group2) {
      return 'url(\'' + group2 + '\')';
    }, this));
  }
  // save to file
  this.model.file.saveAs(
      fileInfo,
      rawHtml,
      goog.bind(function() {
        this.tracker.trackAction('controller-events', 'success', 'file.save', 1);
        silex.controller.ControllerBase.lastSaveUndoIdx = silex.controller.ControllerBase.undoHistory.length - 1;
        this.fileOperationSuccess('File is saved.', false);
        this.view.workspace.setPreviewWindowLocation();
        if (opt_cbk) {
          opt_cbk();
        }
      }, this),
      goog.bind(function(error, msg) {
        silex.utils.Notification.alert('Error: I did not manage to save the file. \n' + (msg || error.message || ''), () => {
          if (opt_errorCbk) {
            opt_errorCbk(error);
          }
        });
        this.tracker.trackAction('controller-events', 'error', 'file.save', -1);
      }, this));
};


/**
 * success of an operation involving changing the file model
 * @param {?string=} opt_message
 * @param {?boolean=} opt_updateTools
 */
silex.controller.ControllerBase.prototype.fileOperationSuccess = function(opt_message, opt_updateTools) {
  // update tools
  if (opt_updateTools) {
    // update dialogs
    this.view.jsEditor.close();
    this.view.cssEditor.close();
    this.view.htmlEditor.close();
    this.view.settingsDialog.redraw();
    this.view.contextMenu.redraw();
    this.view.breadCrumbs.redraw();
  }
  if (opt_message) {
    // notify user
    silex.utils.Notification.notifySuccess(opt_message);
  }
};

