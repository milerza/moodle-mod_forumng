// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// Moodle is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with Moodle.  If not, see <http://www.gnu.org/licenses/>.

/**
 * Register a link handler to open mod/forumng/view.php links in the app
 *
 * @package    mod_forumng
 * @copyright  2018 The Open University
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
(function (t) {
    t.mod_forumng = {};
    t.removeEvent = true;

    /* Register a link handler to open mod/forumng/view.php links anywhere in the app. */
    function AddonModForumngLinkHandler() {
        t.CoreContentLinksModuleIndexHandler.call(this, t.CoreCourseHelperProvider, 'mmaModForumng', 'forumng');
        this.name = "AddonModForumngLinkHandler";
    }
    AddonModForumngLinkHandler.prototype = Object.create(t.CoreContentLinksModuleIndexHandler.prototype);
    AddonModForumngLinkHandler.prototype.constructor = AddonModForumngLinkHandler;
    t.CoreContentLinksDelegate.registerHandler(new AddonModForumngLinkHandler());

   t.newDiscussion = {
       subject: '',
       message: '',
       files: [],
       sticky: 0,
       date: 0,
       postas: 0,
    };

    /**
     * Handles a request for more discussions, getting the next chunk and displaying.
     *
     * @param {object} that The this object when calling this function.
     * @param {object} infiniteScrollEvent
     */
    t.mod_forumng.loadMoreDiscussions = function(that, infiniteScrollEvent) {
        // Gather data.
        var total = that.CONTENT_OTHERDATA.totaldiscussions;
        var current = that.CONTENT_OTHERDATA.discussions.length;
        var groupid = that.CONTENT_OTHERDATA.defaultgroup;
        var cmid = that.module.id;
        var page = that.CONTENT_OTHERDATA.page + 1;
        // Are there any more discussions to be displayed?
        if (current < total) {
            // AJAX to get the next page of discussions.
            that.CoreSitesProvider.getCurrentSite().read(
                'mod_forumng_get_more_discussions', {cmid: cmid, groupid: groupid, pageno: page}
            ).then(function (response) {
                response.forEach(function (discussion) {
                    // Is'nt Angular/Ionic wonderful. This does all the work for us.
                    that.CONTENT_OTHERDATA.discussions.push(discussion);
                });
                that.CONTENT_OTHERDATA.page = page;
                infiniteScrollEvent.complete();
            }).catch(function() {
                infiniteScrollEvent.complete();
            });
        } else {
            infiniteScrollEvent.complete();
        }
    };

    /**
     * Add a new discussion.
     *
     * This will support editing an existing discussion and offline with a little more development.
     *
     * @param {object} that The this object when calling this function.
     */
    t.mod_forumng.addDiscussion = function(that) {
        var site = that.CoreSitesProvider.getCurrentSite();
        var cmid = that.CONTENT_OTHERDATA.cmid;
        var userid = site.getUserId();
        var subject = that.subject;
        var message = that.message;
        var groupId = that.CONTENT_OTHERDATA.group; // No group selection in this form; it is done on previous page.
        var discussionId = that.CONTENT_OTHERDATA.discussion; // This is 0 until we add editing.
        var forumngId = that.CONTENT_OTHERDATA.forumng;
        var attachments = that.CONTENT_OTHERDATA.files; // Type [FileEntry].
        var showsticky = that.CONTENT_OTHERDATA.showsticky;
        var showfrom = that.CONTENT_OTHERDATA.showfrom;
        var postas = that.CONTENT_OTHERDATA.postas;
        showfrom = showfrom !== 0 ? Date.parse(showfrom) / 1000 : 0;
        //var discTimecreated = Date.now(); //TODO part of offline - that.timeCreated || Date.now();
        var saveOffline = false;
        var modal;
        var promise;
        var regexp = /\S+/;
        if (!subject || !subject.match(regexp)) {
            that.CoreUtilsProvider.domUtils.showErrorModal('plugin.mod_forumng.erroremptysubject', true);
            return;
        }
        if (!subject.length > 255) {
            that.CoreUtilsProvider.domUtils.showErrorModal('plugin.mod_forumng.errormaximumsubjectcharacter', true);
            return;
        }
        // Check text in the message.
        var div = document.createElement('div');
        div.innerHTML = message;
        var messagetext = div.textContent;
        if (!message || !messagetext.match(regexp)) {
            that.CoreUtilsProvider.domUtils.showErrorModal('plugin.mod_forumng.erroremptymessage', true);
            return;
        }
        message = that.CoreTextUtilsProvider.formatHtmlLines(message);

        modal = that.CoreUtilsProvider.domUtils.showModalLoading('core.sending', true);

        // Upload attachments first if any.
        if (attachments.length) {
            promise = that.CoreFileUploaderProvider.uploadOrReuploadFiles(attachments, 'mod_forumng', forumngId)
                    .catch(function() {
                // Cannot upload them in online, save them in offline.
                return Promise.reject('Offline not yet enabled');
                //TODO switch below to our own offline functionality.
                // saveOffline = true;
                // return that.AddonModForumHelperProvider.uploadOrStoreNewDiscussionFiles(
                //         forumngId, discTimecreated, attachments, saveOffline);
            });
        } else {
            promise = Promise.resolve(1);
        }

        promise.then(function(draftAreaId) {
            if (saveOffline) {
                // Save discussion in offline.
                //TODO switch below to our own offline functionality.
                // return that.AddonModForumOfflineProvider.addNewDiscussion(forumngId, forumName, courseId, subject,
                //     message, options, groupId, discTimecreated).then(function() {
                //     // Don't return anything.
                // });
            } else {
                // Try to send it to server.
                var site = that.CoreSitesProvider.getCurrentSite();
                var params = {
                    forum: forumngId,
                    discussion: discussionId,
                    group: groupId,
                    subject: subject,
                    message: message,
                    draftarea: draftAreaId, // Note this will be 1 if there are no files.
                    showsticky: showsticky,
                    showfrom: showfrom,
                    postas: postas,
                };
                return site.write('mod_forumng_add_discussion', params).then(function(response) {
                    // Other errors ocurring.
                    if (!response || !response.discussion) {
                        return Promise.reject(that.CoreWSProvider.createFakeWSError(response.errormsg));
                    } else {
                        return response.discussion;
                    }
                });
                // Don't allow offline if there are attachments since they were uploaded fine.
                //TODO switch below to use our own offline functionality.
                // return that.AddonModForumProvider.addNewDiscussion(forumngId, forumName, courseId, subject, message, options,
                //    groupId, undefined, discTimecreated, !attachments.length);
            }
        }).then(function(discussionId) {
            if (discussionId) {
                // Data sent to server, delete stored files (if any).
                //TODO switch below to our own offline functionality.
                //that.AddonModForumHelperProvider.deleteNewDiscussionStoredFiles(this.forumId, discTimecreated);
                //TODO trigger new discussion event or similar?
            }
            t.mod_forumng.setNeedUpdate(cmid, 1, userid);
            //TODO check all functionality in core forum (new-discussion.ts) returnToDiscussions(discussionId) is covered.
            // Navigate back to the discussions page and refresh to show new discussion.
            t.mod_forumng.viewSubscribe =
                that.CoreAppProvider.appCtrl.viewDidEnter.subscribe(t.mod_forumng.forumngRefreshContent);
            that.subject = '';
            that.message = '';
            that.CONTENT_OTHERDATA.files = []; // Type [FileEntry].
            that.CONTENT_OTHERDATA.showsticky = 0;
            that.CONTENT_OTHERDATA.showfrom = 0;
            that.CONTENT_OTHERDATA.postas = 0;
            t.newDiscussion.date = 0;
            that.NavController.pop();
        }).catch(function(msg) {
            that.CoreUtilsProvider.domUtils.showErrorModalDefault(msg, 'plugin.mod_forumng.cannotcreatediscussion', true);
        }).finally(function() {
            modal.dismiss();
        });
    };

    /**
     * Allows refreshing content after creating a new discussion.
     *
     * @param {object} view Object returned by subscription to viewDidEnter.
     */
    t.mod_forumng.forumngRefreshContent = function(view) {
        if (view.name === 'CoreSitePluginsModuleIndexPage') {
            t.mod_forumng.viewSubscribe.unsubscribe();
            delete t.mod_forumng.viewSubscribe;
            t.mod_forumng.currentDiscussionsPage.refreshContent();
            // Clear forum form content after refresh.
            t.newDiscussion.postas = 0;
            t.newDiscussion.message = '';
            t.newDiscussion.subject = '';
            t.newDiscussion.files = [];
            t.newDiscussion.date = 0;
            t.newDiscussion.showsticky = 0;
        }
    };

    /**
     * Add a reply.
     *
     * This will support editing an existing post and offline with a little more development.
     *
     * @param {object} that The this object when calling this function.
     */
    t.mod_forumng.reply = function(that) {
        var subject = that.subject; // Can be empty or undefined - probably usually is!
        var message = that.message;
        var replyto = that.CONTENT_OTHERDATA.replyto;
        var forumngId = that.CONTENT_OTHERDATA.forumng;
        var attachments = that.CONTENT_OTHERDATA.files; // Type [FileEntry].
        //var discTimecreated = Date.now(); //TODO part of offline - that.timeCreated || Date.now();
        var saveOffline = false;
        var modal;
        var promise;

        if (!message) {
            that.CoreUtilsProvider.domUtils.showErrorModal('plugin.mod_forumng.erroremptymessage', true);
            return;
        }
        message = that.CoreTextUtilsProvider.formatHtmlLines(message);

        modal = that.CoreUtilsProvider.domUtils.showModalLoading('core.sending', true);

        // Upload attachments first if any.
        if (attachments.length) {
            promise = that.CoreFileUploaderProvider.uploadOrReuploadFiles(attachments, 'mod_forumng', forumngId)
                    .catch(function() {
                // Cannot upload them in online, save them in offline.
                return Promise.reject('Offline not yet enabled');
                //TODO switch below to our own offline functionality.
                // saveOffline = true;
                // return that.AddonModForumHelperProvider.uploadOrStoreNewDiscussionFiles(
                //         forumngId, discTimecreated, attachments, saveOffline);
            });
        } else {
            promise = Promise.resolve(1);
        }

        promise.then(function(draftAreaId) {
            if (saveOffline) {
                // Save discussion in offline.
                //TODO switch below to our own offline functionality.
                // return that.AddonModForumOfflineProvider.addNewDiscussion(forumngId, forumName, courseId, subject,
                //     message, options, groupId, discTimecreated).then(function() {
                //     // Don't return anything.
                // });
            } else {
                // Try to send it to server.
                var site = that.CoreSitesProvider.getCurrentSite();
                var params = {
                    replyto: replyto,
                    message: message,
                    draftarea: draftAreaId
                };
                if (!(subject === undefined || subject === '')) {
                    params.subject = subject;
                }
                return site.write('mod_forumng_reply', params).then(function(response) {
                    if (!response || !response.post) {
                        return Promise.reject(that.CoreWSProvider.createFakeWSError(response.errormsg));
                    } else {
                        return response.post;
                    }
                });
                // Don't allow offline if there are attachments since they were uploaded fine.
                //TODO switch below to use our own offline functionality.
                // return that.AddonModForumProvider.addNewDiscussion(forumngId, forumName, courseId, subject, message, options,
                //    groupId, undefined, discTimecreated, !attachments.length);
            }
        }).then(function(postId) {
            if (postId) {
                // Data sent to server, delete stored files (if any).
                //TODO switch below to our own offline functionality.
                //that.AddonModForumHelperProvider.deleteNewDiscussionStoredFiles(this.forumId, discTimecreated);
                //TODO trigger new discussion event or similar?
            }
            //TODO check all functionality in core forum (new-discussion.ts) returnToDiscussions(discussionId) is covered.
            // Navigate back to the posts page and refresh to show new post.
            t.mod_forumng.viewPostsSubscribe =
                    that.CoreAppProvider.appCtrl.viewDidEnter.subscribe(t.mod_forumng.forumngRefreshPostsContent);
            that.NavController.pop();
        }).catch(function(msg) {
            that.CoreUtilsProvider.domUtils.showErrorModalDefault(msg, 'plugin.mod_forumng.cannotcreatereply', true);
        }).finally(function() {
            modal.dismiss();
        });
    };

    /**
     * Lock discussion.
     *
     * This will support editing an existing post and offline with a little more development.
     *
     * @param {object} that The this object when calling this function.
     */
    t.mod_forumng.lock_discussion = function(that) {
        var subject = that.subject;
        var message = that.message;
        var attachments = that.CONTENT_OTHERDATA.files;
        var postas = that.CONTENT_OTHERDATA.postas;
        var discussionid = that.CONTENT_OTHERDATA.discussionid;
        var forumngId = that.CONTENT_OTHERDATA.forumngid;
        var saveOffline = false;
        var modal;
        var promise;

        if (!subject.length > 255) {
            that.CoreUtilsProvider.domUtils.showErrorModal('plugin.mod_forumng.errormaximumsubjectcharacter', true);
            return;
        }
        if (!message) {
            that.CoreUtilsProvider.domUtils.showErrorModal('plugin.mod_forumng.erroremptymessage', true);
            return;
        }
        message = that.CoreTextUtilsProvider.formatHtmlLines(message);

        modal = that.CoreUtilsProvider.domUtils.showModalLoading('core.sending', true);

        // Upload attachments first if any.
        if (attachments.length) {
            promise = that.CoreFileUploaderProvider.uploadOrReuploadFiles(attachments, 'mod_forumng', forumngId)
                .catch(function() {
                    // Cannot upload them in online, save them in offline.
                    return Promise.reject('Offline not yet enabled');
                    //TODO switch below to our own offline functionality.
                    // saveOffline = true;
                    // return that.AddonModForumHelperProvider.uploadOrStoreNewDiscussionFiles(
                    //         forumngId, discTimecreated, attachments, saveOffline);
                });
        } else {
            promise = Promise.resolve(1);
        }

        promise.then(function(draftAreaId) {
            if (saveOffline) {
                // Save discussion in offline.
                //TODO switch below to our own offline functionality.
                // return that.AddonModForumOfflineProvider.addNewDiscussion(forumngId, forumName, courseId, subject,
                //     message, options, groupId, discTimecreated).then(function() {
                //     // Don't return anything.
                // });
            } else {
                // Try to send it to server.
                var site = that.CoreSitesProvider.getCurrentSite();
                var params = {
                    discussionid: discussionid,
                    cloneid: 0,
                    subject: subject,
                    message: message,
                    draftarea: draftAreaId,
                    postas: postas,
                };
                if (!(subject === undefined || subject === '')) {
                    params.subject = subject;
                }

                return site.write('mod_forumng_lock_discussion', params).then(function(response) {
                    if (!response || !response.post) {
                        return Promise.reject(that.CoreWSProvider.createFakeWSError(response.errormsg));
                    } else {
                        return response.post;
                    }
                });
                // Don't allow offline if there are attachments since they were uploaded fine.
                //TODO switch below to use our own offline functionality.
                // return that.AddonModForumProvider.addNewDiscussion(forumngId, forumName, courseId, subject, message, options,
                //    groupId, undefined, discTimecreated, !attachments.length);
            }
        }).then(function(postId) {
            if (postId) {
                // Data sent to server, delete stored files (if any).
                //TODO switch below to our own offline functionality.
                //that.AddonModForumHelperProvider.deleteNewDiscussionStoredFiles(this.forumId, discTimecreated);
                //TODO trigger new discussion event or similar?
            }
            //TODO check all functionality in core forum (new-discussion.ts) returnToDiscussions(discussionId) is covered.
            that.refreshContent();
        }).catch(function(msg) {
            that.CoreUtilsProvider.domUtils.showErrorModalDefault(msg, 'plugin.mod_forumng.cannotlockdiscussion', true);
        }).finally(function() {
            modal.dismiss();
        });
    };

    /**
     * Allows refreshing content after creating a reply.
     *
     * @param {object} view Object returned by subscription to viewDidEnter.
     */
    t.mod_forumng.forumngRefreshPostsContent = function(view) {
        if (view.name === 'CoreSitePluginsPluginPage') {
            t.mod_forumng.viewPostsSubscribe.unsubscribe();
            delete t.mod_forumng.viewPostsSubscribe;
            t.mod_forumng.currentPostsPage.refreshContent();
        }
    };

    // Following functions are called during page initialisation and allow adding new functionality
    // to the main component (coreCompileHtmlFakeComponent) as outerThis.

    /**
     * Initialisation for the discussions page.
     *
     * @param {object} outerThis The main component.
     */
    window.forumngDiscussionsPageInit = function(outerThis) {

        var site = outerThis.CoreSitesProvider.getCurrentSite();
        var cmid = outerThis.module.id;
        var userid = site.getUserId();
        var courseid = outerThis.courseId;
        var preSets = {updateFrequency: 0, getFromCache: false};
        var PopoverTransition = function() {
            var popover = document.querySelector('.popover-content');
            if (popover) {
                popover.style.right = 'calc(env(safe-area-inset-right) + 0px)';
                popover.style.left = null;
            }
        };
        if (t.removeEvent) {
            window.addEventListener("orientationchange", PopoverTransition);
            t.removeEvent = false;
        }
        outerThis.updateSortContent = function(args){
            outerThis.CoreSitePluginsProvider.getContent('mod_forumng', 'forumng_view', args, preSets);
            t.mod_forumng.setNeedUpdate(cmid, 1, userid);
            outerThis.updateContent(args, 'mod_forumng', 'forumng_view', true);
        };
        outerThis.updateGroupContent = function(args){
            outerThis.CoreSitePluginsProvider.getContent('mod_forumng', 'forumng_view', args, preSets);
            t.mod_forumng.setNeedUpdate(cmid, 1, userid);
            outerThis.updateContent(args, 'mod_forumng', 'forumng_view', true);
        };
        // Check and handle module completion feature.
        t.CoreCourseProvider.checkModuleCompletion(outerThis.courseId, outerThis.module.completiondata);
        // Make loadMoreDiscussion available from the template.
        outerThis.loadMoreDiscussions = function(infiniteScrollEvent) {
            t.mod_forumng.loadMoreDiscussions(outerThis, infiniteScrollEvent);
        };
        // Same for isOnline.
        outerThis.isOnline = function() {
            return outerThis.CoreAppProvider.isOnline();
        };

        outerThis.ionViewWillLeave = function() {
            var preSets = {updateFrequency: 0, getFromCache: false};
            var updatemainpageargs = {'cmid' : cmid, 'courseid': courseid};
            window.removeEventListener("orientationchange", PopoverTransition);
            t.mod_forumng.getNeedUpdate(cmid, userid).then(function(result) {
                // When we go the forum the agrs is only have {cmid, courseid} so we need to update the cache the newest version.
                if (typeof(result) != 'undefined' && result != null && result) {
                    t.mod_forumng.setNeedUpdate(cmid, null, userid);
                    outerThis.CoreSitePluginsProvider.getContent('mod_forumng', 'forumng_view', updatemainpageargs, preSets);
                }
            });
        };
        outerThis.showMessage = function (text) {
            var successalert = this.AlertController.create({
                title: '',
                subTitle: text,
                buttons: [this.TranslateService.instant('core.ok')]
            });
            successalert.present();
        };
        /**
         * Called by the menu option that shows/hides auto mark post as read features.
         *
         * @param {bool} enable True to show features, false to hide
         */
        outerThis.enableAutoMarkPostAsRead = function(enable) {
            // Make this change after a slight delay so that it only happens after the menu
            // animation finishes, otherwise the change of button looks bad.
            if (outerThis.isOnline()) {
                setTimeout(function() {
                    site.write('mod_forumng_manual_mark', {'cmid': cmid, 'cloneid' : 0, 'value' : enable}).then(function(result) {
                        if (!result.errormsg) {
                            // We need to refresh because the cached page.
                            outerThis.CONTENT_OTHERDATA.manualmark = enable;
                            // We need to refresh because the cached page.
                            t.mod_forumng.setPreference('AutoMarkPostAsRead', enable, userid);
                            t.mod_forumng.setNeedUpdate(cmid, 1, userid);
                            var args = {'cmid' : cmid, 'courseid': courseid, group: outerThis.CONTENT_OTHERDATA.defaultgroup,
                                sortid: outerThis.CONTENT_OTHERDATA.selectedsort, isupdate: 1};
                            var preSets = {updateFrequency: 0, getFromCache: false};
                            outerThis.CoreSitePluginsProvider.getContent('mod_forumng', 'forumng_view', args, preSets);
                            outerThis.updateContent(args, 'mod_forumng', 'forumng_view', true);
                        } else {
                            var alert = outerThis.AlertController.create({
                                title: "Error",
                                subTitle: result.errormsg,
                            });
                            alert.present();
                        }
                    }).catch( function(error) {
                        var alert = outerThis.AlertController.create({
                            title: "Error",
                            subTitle: error,
                        });
                        alert.present();
                    });
                }, 100);
            } else {
                //TODO switch below to our own offline functionality.
                // Will be implemented sync later.
                t.mod_forumng.setPreference('AutoMarkPostAsRead', enable, userid);
            }

        };

        /**
         * Mark all post read.
         *
         */
        outerThis.MarkAllPostsRead = function() {
            if (outerThis.isOnline()) {
                site.write('mod_forumng_mark_all_post_read', {'cmid': cmid, 'cloneid' : 0, 'groupid' : outerThis.CONTENT_OTHERDATA.defaultgroup}).then(function(result) {
                    if (!result.errormsg) {
                        // We need to update the newest content because the cached page.
                        var args = {'cmid' : cmid, 'courseid': courseid, group: outerThis.CONTENT_OTHERDATA.defaultgroup,
                            sortid: outerThis.CONTENT_OTHERDATA.selectedsort, isupdate: 1};
                        var preSets = {updateFrequency: 0, getFromCache: false};
                        t.mod_forumng.setNeedUpdate(cmid, 1, userid);
                        outerThis.CoreSitePluginsProvider.getContent('mod_forumng', 'forumng_view', args, preSets);
                        window.removeEventListener("orientationchange", PopoverTransition);
                        outerThis.updateContent(args, 'mod_forumng', 'forumng_view', true);
                    } else {
                        var alert = outerThis.AlertController.create({
                            title: "Error",
                            subTitle: result.errormsg,
                        });
                        alert.present();
                    }
                }).catch( function(error) {
                    var alert = outerThis.AlertController.create({
                        title: "Error",
                        subTitle: error,
                    });
                    alert.present();
                });
            } else {
                var alert = outerThis.AlertController.create({
                    title: "Error",
                    subTitle: "Offline is not supported",
                });
                alert.present();
                //TODO switch below to our own offline functionality.
                // Will be implemented sync later.
            }
        };
        // Outerthis has the refreshContent function, so get a link to it here.
        t.mod_forumng.currentDiscussionsPage = outerThis;
    };

    /**
     * Initialisation for the posts page.
     *
     * @param {object} outerThis The main component.
     */
    window.forumngPostsPageInit = function(outerThis) {
        outerThis.PostControl = outerThis.FormBuilder.control();
        t.removeEvent = true;

        outerThis.isOnline = function() {
            return outerThis.CoreAppProvider.isOnline();
        };

        var PopoverTransition = function() {
            var popover = document.querySelector('.popover-content');
            if (popover) {
                popover.style.right = 'calc(env(safe-area-inset-right) + 10px)';
                popover.style.left = null;
            }
        };
        if (t.removeEvent) {
            window.addEventListener("orientationchange", PopoverTransition);
            t.removeEvent = false;
        }

        outerThis.lock = function() {
            if (!outerThis.CONTENT_OTHERDATA.lock) {
                outerThis.CONTENT_OTHERDATA.lock = 1;
                outerThis.subject = outerThis.TranslateService.instant('plugin.mod_forumng.lockedtitle');
                setTimeout(function() {
                    document.getElementById('mma-forumng-form').scrollIntoViewIfNeeded();
                }, 100);
            }
        };

        outerThis.ionViewCanLeave = function() {
            var message = outerThis.message;
            var attachments = outerThis.CONTENT_OTHERDATA.files; // Type [FileEntry].
            var postas = outerThis.CONTENT_OTHERDATA.postas;
            if (outerThis.CONTENT_OTHERDATA.lock && (message || attachments.length > 0 || postas != 0)) {
                return outerThis.CoreDomUtilsProvider.showConfirm(outerThis.TranslateService.instant('plugin.mod_forumng.leavemessage')).then(function() {
                    if (attachments.length > 0) {
                        return outerThis.CoreFileUploaderProvider.clearTmpFiles(attachments);
                    }
                });
            }
            t.mod_forumng.currentDiscussionsPage.refreshContent();
            window.removeEventListener("orientationchange", PopoverTransition);
            return;
        };

        outerThis.cancel = function() {
            var message = outerThis.message;
            var attachments = outerThis.CONTENT_OTHERDATA.files; // Type [FileEntry].
            var postas = outerThis.CONTENT_OTHERDATA.postas;
            if (outerThis.CONTENT_OTHERDATA.lock && (message || attachments.length > 0 || postas != 0)) {
                return outerThis.CoreDomUtilsProvider.showConfirm(outerThis.TranslateService.instant('plugin.mod_forumng.leavemessage')).then(function() {
                    outerThis.CONTENT_OTHERDATA.lock = 0;
                    outerThis.CONTENT_OTHERDATA.files = [];
                    outerThis.PostControl.setValue('');
                    outerThis.message = '';
                    if (attachments.length > 0) {
                        return outerThis.CoreFileUploaderProvider.clearTmpFiles(attachments);
                    }
                });
            } else {
                outerThis.CONTENT_OTHERDATA.lock = 0;
            }
        };

        outerThis.lock_discussion = function() {
            t.mod_forumng.lock_discussion(outerThis);
        };
        outerThis.expand_all_posts = function() {
            (function expandPosts(postArr) {
                for(var ind in postArr) {
                    var reply = postArr[ind];
                    if (!reply.isexpanded) {
                        reply.isexpanded = true;
                    }
                    if (reply.subreplies) {
                        expandPosts(reply.subreplies);
                    }
                }
            })(outerThis.CONTENT_OTHERDATA.replies);
            outerThis.CONTENT_OTHERDATA.isexpandall = true;
            outerThis.CONTENT_OTHERDATA.iscollapseall = false;
        };

        outerThis.collapse_all_posts = function() {
            (function expandPosts(postArr) {
                for(var ind in postArr) {
                    var reply = postArr[ind];
                    if (reply.isexpanded) {
                        reply.isexpanded = false;
                    }
                    if (reply.subreplies) {
                        expandPosts(reply.subreplies);
                    }
                }
            })(outerThis.CONTENT_OTHERDATA.replies);
            outerThis.CONTENT_OTHERDATA.isexpandall = false;
            outerThis.CONTENT_OTHERDATA.iscollapseall = true;
        };

        t.mod_forumng.currentPostsPage = outerThis;

        setTimeout(function(){
            var el = document.querySelectorAll('div[class="unread-post"]');
            if (el && el.length) {
                el[0].scrollIntoView();
            }
        }, 500);
    };

    /**
     * Initialisation for the add discussion page.
     *
     * @param {object} outerThis The main component.
     */
    window.forumngAddDiscussionInit = function(outerThis) {
        outerThis.addDiscussionControl = outerThis.FormBuilder.control();
        outerThis.subject = t.newDiscussion.subject ? t.newDiscussion.subject : outerThis.subject;
        outerThis.addDiscussionControl.value = t.newDiscussion.message ? t.newDiscussion.message : outerThis.message;
        outerThis.CONTENT_OTHERDATA.files = t.newDiscussion.files ? t.newDiscussion.files : outerThis.files;
        outerThis.CONTENT_OTHERDATA.showsticky = t.newDiscussion.sticky ? t.newDiscussion.sticky : outerThis.CONTENT_OTHERDATA.showsticky;
        outerThis.CONTENT_OTHERDATA.showfrom = t.newDiscussion.date ? t.newDiscussion.date : outerThis.CONTENT_OTHERDATA.showfrom;
        outerThis.CONTENT_OTHERDATA.postas = t.newDiscussion.postas ? t.newDiscussion.postas : outerThis.CONTENT_OTHERDATA.postas;
        var regexp = /\S+/;
        outerThis.addDiscussion = function() {
            t.mod_forumng.addDiscussion(outerThis);
        };

        outerThis.NewDiscussionCancel = function() {
            outerThis.NavController.pop();
        };

        outerThis.ionViewCanLeave = function() {
            var subject = outerThis.subject;
            var message = outerThis.message;
            var attachments = outerThis.CONTENT_OTHERDATA.files; // Type [FileEntry].
            var showsticky = outerThis.CONTENT_OTHERDATA.showsticky;
            var showfrom = outerThis.CONTENT_OTHERDATA.showfrom;
            var postas = outerThis.CONTENT_OTHERDATA.postas;
            if (subject || message || attachments.length > 0 || showsticky != 0 || showfrom != 0 || postas != 0) {
                t.newDiscussion.postas = 0;
                t.newDiscussion.message = '';
                t.newDiscussion.subject = '';
                t.newDiscussion.files = [];
                t.newDiscussion.date = 0;
                t.newDiscussion.sticky = 0;
                return outerThis.CoreDomUtilsProvider.showConfirm(outerThis.TranslateService.instant('plugin.mod_forumng.leavemessage')).then(function() {
                    return outerThis.CoreFileUploaderProvider.clearTmpFiles(attachments);
                });
            }
            return;
        };

        outerThis.onMessageChange = function (text) {
            // Check text in the message.
            var div = document.createElement('div');
            div.innerHTML = text;
            var messagetext = div.textContent;
            if (!messagetext.match(regexp)) {
                text = '';
            }
            t.newDiscussion.message = text;
        };
        /**
         * Refresh the data.
         *
         * @param {any} refresher Refresher.
         */
        outerThis.onSubjectChange = function() {
            if (!outerThis.subject.match(regexp)) {
                outerThis.subject = '';
            }
            t.newDiscussion.subject = outerThis.subject;

        };

        outerThis.onFileChange = function() {
            t.newDiscussion.files = outerThis.CONTENT_OTHERDATA.files;
        };

        outerThis.onStickyChange = function() {
            t.newDiscussion.sticky = outerThis.CONTENT_OTHERDATA.showsticky;
        };

        outerThis.onDateChange = function() {
            t.newDiscussion.date = outerThis.CONTENT_OTHERDATA.showfrom;
        };

        outerThis.PostAsChange = function() {
            t.newDiscussion.postas = outerThis.CONTENT_OTHERDATA.postas;
        };

        // Calculate format to use. ion-datetime doesn't support escaping characters ([]), so we remove them.
        outerThis.dateFormat = outerThis.CoreTimeUtilsProvider.convertPHPToMoment('%d %B %Y')
            .replace(/[\[\]]/g, '');

        // Default current date. If we need it.
        // outerThis.startDate = outerThis.CoreTimeUtilsProvider.toDatetimeFormat();

        // Network online check that disables the submission button if the app is offline.
        if (!t.mod_forumng.subscription) {
            t.mod_forumng.subscription = outerThis.CoreAppProvider.network.onchange().subscribe(function(online) {
                if (!document.getElementById('mma-forumng-add-discussion-button')) {
                    t.mod_forumng.subscription.unsubscribe();
                    delete t.mod_forumng.subscription;
                    return;
                }
                // Disable the add discusion button if the device goes offline.
                document.getElementById('mma-forumng-add-discussion-button').disabled = !t.CoreAppProvider.isOnline();
            });
        }
    };

    /**
     * Initialisation for the reply page.
     *
     * @param {object} outerThis The main component.
     */
    window.forumngReplyInit = function(outerThis) {
        outerThis.reply = function() {
            t.mod_forumng.reply(outerThis);
        };
        if (!t.mod_forumng.replySubscription) {
            t.mod_forumng.replySubscription = outerThis.CoreAppProvider.network.onchange().subscribe(function(online) {
                if (!document.getElementById('mma-forumng-reply-button')) {
                    t.mod_forumng.replySubscription.unsubscribe();
                    delete t.mod_forumng.replySubscription;
                    return;
                }
                document.getElementById('mma-forumng-reply-button').disabled = !t.CoreAppProvider.isOnline();
            });
        }
    };

    t.mod_forumng.settingsTable = 'mod_forumng_settings';
    t.mod_forumng.settingsTableSchema = {
        name: t.mod_forumng.settingsTable,
        columns: [
            {
                name: 'key',
                type: 'TEXT',
                primaryKey: true
            },
            {
                name: 'value',
                type: 'TEXT',
                notNull: true
            },
            {
                name: 'userid',
                type: 'TEXT',
            },
        ]
    };
    /**
     * Sets preference. If you set value to undefined, it is cleared.
     *
     * @param {string} key Key to set
     * @param {string} [value] Value to set - leave undefined to remove it
     * @return {Promise} Promise resolved when finished
     */
    t.mod_forumng.setPreference = function(key, value, userid) {
        // Create the table if it doesn't exist already, then set the value.
        var db = t.CoreSitesProvider.getCurrentSite().getDb();
        return db.createTableFromSchema(t.mod_forumng.settingsTableSchema).then(function() {
            return db.recordExists(t.mod_forumng.settingsTable, {key: key, userid: userid}).then(function() {
                if (value === undefined) {
                    return db.deleteRecords(t.mod_forumng.settingsTable, {key: key, userid: userid});
                } else {
                    return db.updateRecords(t.mod_forumng.settingsTable, {value: value}, {key: key, userid: userid});
                }
            }, function() {
                if (value !== undefined) {
                    return db.insertRecord(t.mod_forumng.settingsTable, {key: key, userid: userid, value: value});
                }
            });
        });
    };
    /**
     * Gets preference (as promise) - resolved to null if not found
     *
     * @param {string} key Key to read
     * @return {Promise} Promise which will be resolved once the preference has been read
     */
    t.mod_forumng.getPreference = function(key, userid) {
        var db = t.CoreSitesProvider.getCurrentSite().getDb();
        return db.createTableFromSchema(t.mod_forumng.settingsTableSchema).then(function() {
            return db.getRecord(t.mod_forumng.settingsTable, { key: key, userid: userid}).then(function(record) {
                return Promise.resolve(record.value);
            }, function() {
                return Promise.resolve(null);
            });
        });
    };

    t.mod_forumng.needUpdate = 'mod_forumng_needupdate';
    t.mod_forumng.needUpdateTableSchema = {
        name: t.mod_forumng.needUpdate,
        columns: [
            {
                name: 'cmid',
                type: 'TEXT',
                primaryKey: true
            },
            {
                name: 'userid',
                type: 'TEXT',
            },
            {
                name: 'needupdate',
                type: 'TEXT',
            },
        ]
    };
    /**
     * Set needupdate when we have a new update from the page.
     *
     * @param cmid
     * @param needupdate
     * @param userid
     * @returns {Promise} Promise resolved when finished
     */
    t.mod_forumng.setNeedUpdate = function(cmid, needupdate, userid) {
        // Create the table if it doesn't exist already, then set the value.
        var db = t.CoreSitesProvider.getCurrentSite().getDb();
        return db.createTableFromSchema(t.mod_forumng.needUpdateTableSchema).then(function() {
            return db.recordExists(t.mod_forumng.needUpdate, {cmid: cmid, userid: userid}).then(function() {
                if (needupdate === undefined) {
                    return db.deleteRecords(t.mod_forumng.needUpdate, {cmid: cmid, userid: userid});
                } else {
                    return db.updateRecords(t.mod_forumng.needUpdate, {needupdate: needupdate}, {cmid: cmid, userid: userid});
                }
            }, function() {
                if (needupdate !== undefined) {
                    return db.insertRecord(t.mod_forumng.needUpdate, {cmid: cmid, userid: userid, needupdate: needupdate});
                }
            });
        });
    };

    /**
     * Get needupdate when we have a new update from the page.
     *
     * @param cmid
     * @param userid
     * @returns {Promise} Promise resolved when finished
     */
    t.mod_forumng.getNeedUpdate = function(cmid, userid) {
        var db = t.CoreSitesProvider.getCurrentSite().getDb();
        return db.createTableFromSchema(t.mod_forumng.needUpdateTableSchema).then(function() {
            return db.getRecord(t.mod_forumng.needUpdate, {cmid: cmid, userid: userid}).then(function(record) {
                return Promise.resolve(record.needupdate);
            }, function() {
                return Promise.resolve(null);
            });
        });
    };
})(this);
