/*
	***** BEGIN LICENSE BLOCK *****
	
	Copyright © 2020 Corporation for Digital Scholarship
					 Vienna, Virginia, USA
					 https://www.zotero.org
	
	This file is part of Zotero.
	
	Zotero is free software: you can redistribute it and/or modify
	it under the terms of the GNU Affero General Public License as published by
	the Free Software Foundation, either version 3 of the License, or
	(at your option) any later version.
	
	Zotero is distributed in the hope that it will be useful,
	but WITHOUT ANY WARRANTY; without even the implied warranty of
	MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
	GNU Affero General Public License for more details.
	
	You should have received a copy of the GNU Affero General Public License
	along with Zotero.  If not, see <http://www.gnu.org/licenses/>.
	
	***** END LICENSE BLOCK *****
*/

"use strict";

{
	class CollapsibleSection extends XULElementBase {
		_head = null;
		
		_title = null;

		_addButton = null;
		
		_listenerAdded = false;
		
		get open() {
			if (this.empty) {
				return false;
			}
			return this.hasAttribute('open');
		}
		
		set open(val) {
			val = !!val;
			let open = this.open;
			if (open === val || this.empty) return;
			this.render();
			if (!this._restoringOpenState && this._head?.nextSibling?.scrollHeight) {
				this.style.setProperty('--open-height', `${this._head.nextSibling.scrollHeight}px`);
			}
			else {
				this.style.setProperty('--open-height', 'auto');
			}
			
			// eslint-disable-next-line no-void
			void getComputedStyle(this).maxHeight; // Force style calculation! Without this the animation doesn't work
			this.toggleAttribute('open', val);
			if (!this.dispatchEvent(new CustomEvent('toggle', { bubbles: false, cancelable: true }))) {
				// Revert
				this.toggleAttribute('open', open);
				return;
			}
			if (!val && this.ownerDocument?.activeElement && this.contains(this.ownerDocument?.activeElement)) {
				this.ownerDocument.activeElement.blur();
			}
			
			this._saveOpenState();
		}
		
		get empty() {
			return this.hasAttribute('empty');
		}
		
		set empty(val) {
			this._runWithTransitionsDisabled(() => {
				this.toggleAttribute('empty', !!val);
			});
		}
		
		setCount(count) {
			this.setAttribute('data-l10n-args', JSON.stringify({ count }));
			this.empty = !count;
		}
		
		get label() {
			return this.getAttribute('label');
		}
		
		set label(val) {
			this.setAttribute('label', val);
		}
		
		get showAdd() {
			return this.hasAttribute('show-add');
		}
		
		set showAdd(val) {
			this.toggleAttribute('show-add', !!val);
		}
		
		static get observedAttributes() {
			return ['open', 'empty', 'label', 'show-add'];
		}
		
		attributeChangedCallback() {
			this.render();
		}
		
		init() {
			if (!this.dataset.pane) {
				throw new Error('data-pane is required');
			}
			
			this.tabIndex = 0;
			
			this._head = document.createElement('div');
			this._head.role = 'button';
			this._head.className = 'head';
			this._head.addEventListener('click', this._handleClick);
			this._head.addEventListener('keydown', this._handleKeyDown);
			this._head.addEventListener('contextmenu', this._handleContextMenu);

			this._title = document.createElement('span');
			this._title.className = 'title';
			this._head.append(this._title);
			
			this._addButton = document.createXULElement('toolbarbutton');
			this._addButton.className = 'add';
			this._addButton.addEventListener('command', (event) => {
				this.dispatchEvent(new CustomEvent('add', {
					...event,
					detail: { button: this._addButton },
					bubbles: false
				}));
			});
			this._head.append(this._addButton);
			
			this._contextMenu = this._buildContextMenu();
			if (this._contextMenu) {
				let popupset = document.createXULElement('popupset');
				popupset.append(this._contextMenu);
				this._head.append(popupset);
			}
			
			let twisty = document.createXULElement('toolbarbutton');
			twisty.className = 'twisty';
			this._head.append(twisty);
			
			this.prepend(this._head);

			this._runWithTransitionsDisabled(() => {
				this._restoreOpenState();
				this.render();
			});
			
			this._notifierID = Zotero.Prefs.registerObserver(`panes.${this.dataset.pane}.open`, this._restoreOpenState.bind(this));
			
			if (this.hasAttribute('data-l10n-id') && !this.hasAttribute('data-l10n-args')) {
				this.setAttribute('data-l10n-args', JSON.stringify({ count: 0 }));
			}
		}
		
		_buildContextMenu() {
			let containerRoot = this.closest('.zotero-view-item-container, context-notes-list');
			
			let contextMenu = document.createXULElement('menupopup');
			let collapseOtherSections = document.createXULElement('menuitem');
			collapseOtherSections.classList.add('menuitem-iconic', 'zotero-menuitem-collapse-others');
			collapseOtherSections.setAttribute('data-l10n-id', 'collapse-other-sections');
			collapseOtherSections.addEventListener('command', () => {
				// Scroll to the top (first section), so we don't end up scrolled past the end
				containerRoot.querySelector('collapsible-section').scrollIntoView({ block: 'start' });
				for (let section of containerRoot.querySelectorAll('collapsible-section')) {
					if (section !== this) {
						section.open = false;
					}
				}
			});
			contextMenu.append(collapseOtherSections);

			let expandAllSections = document.createXULElement('menuitem');
			expandAllSections.classList.add('menuitem-iconic', 'zotero-menuitem-expand-all');
			expandAllSections.setAttribute('data-l10n-id', 'expand-all-sections');
			expandAllSections.addEventListener('command', () => {
				for (let section of containerRoot.querySelectorAll('collapsible-section')) {
					section.open = true;
				}
			});
			contextMenu.append(expandAllSections);
			
			let pinSection, unpinSection;
			let pinUnpinSeparator = document.createXULElement('menuseparator');
			contextMenu.append(pinUnpinSeparator);

			pinSection = document.createXULElement('menuitem');
			pinSection.classList.add('menuitem-iconic', 'zotero-menuitem-pin');
			pinSection.setAttribute('data-l10n-id', 'pin-section');
			pinSection.addEventListener('command', () => {
				let sidenav = this._getSidenav();
				sidenav.scrollToPane(this.dataset.pane, 'smooth');
				sidenav.pinnedPane = this.dataset.pane;
			});
			contextMenu.append(pinSection);

			unpinSection = document.createXULElement('menuitem');
			unpinSection.classList.add('menuitem-iconic', 'zotero-menuitem-unpin');
			unpinSection.setAttribute('data-l10n-id', 'unpin-section');
			unpinSection.addEventListener('command', () => {
				this._getSidenav().pinnedPane = null;
			});
			contextMenu.append(unpinSection);

			contextMenu.addEventListener('popupshowing', () => {
				let sections = Array.from(containerRoot.querySelectorAll('collapsible-section'));
				collapseOtherSections.disabled = sections.every(section => section === this || !section.open);
				expandAllSections.disabled = sections.every(section => section.open || section.empty);

				let sidenav = this._getSidenav();
				if (sidenav?.isPanePinnable(this.dataset.pane)) {
					pinUnpinSeparator.hidden = false;
					pinSection.hidden = sidenav.pinnedPane == this.dataset.pane;
					unpinSection.hidden = sidenav.pinnedPane != this.dataset.pane;
				}
				else {
					pinUnpinSeparator.hidden = true;
					pinSection.hidden = true;
					unpinSection.hidden = true;
				}
			});
			
			return contextMenu;
		}
		
		destroy() {
			this._head.removeEventListener('click', this._handleClick);
			this._head.removeEventListener('keydown', this._handleKeyDown);
			this._head.removeEventListener('contextmenu', this._handleContextMenu);
			
			Zotero.Prefs.unregisterObserver(this._notifierID);
		}
		
		_saveOpenState() {
			Zotero.Prefs.set(`panes.${this.dataset.pane}.open`, this.open);
		}
		
		_restoreOpenState() {
			this._restoringOpenState = true;
			this.open = Zotero.Prefs.get(`panes.${this.dataset.pane}.open`) ?? true;
			this._restoringOpenState = false;
		}

		_runWithTransitionsDisabled(fn) {
			this.classList.add('disable-transitions');
			fn();
			// Need to wait a tick before re-enabling - forcing style recalculation isn't enough here
			requestAnimationFrame(() => {
				this.classList.remove('disable-transitions');
			});
		}
		
		_handleClick = (event) => {
			if (event.target.closest('.add')) return;
			this.open = !this.open;
		};
		
		_handleKeyDown = (event) => {
			if (event.target.closest('.add')) return;
			if (event.key === 'Enter' || event.key === ' ') {
				this.open = !this.open;
				event.preventDefault();
			}
		};
		
		_handleContextMenu = (event) => {
			if (event.target.closest('.add')) return;
			event.preventDefault();
			this._contextMenu?.openPopupAtScreen(event.screenX, event.screenY, true);
		};
		
		_getSidenav() {
			return this.closest('.zotero-view-item-container')?.querySelector('item-pane-sidenav');
		}
		
		render() {
			if (!this.initialized) return;
			
			if (!this._listenerAdded && this._head?.nextSibling) {
				this._head.nextSibling.addEventListener('transitionend', () => {
					this.style.setProperty('--open-height', 'auto');
				});
				this._listenerAdded = true;
			}
			
			this._head.setAttribute('aria-expanded', this.open);
			this._title.textContent = this.label;
			this._addButton.hidden = !this.showAdd;
		}
	}
	customElements.define("collapsible-section", CollapsibleSection);
}