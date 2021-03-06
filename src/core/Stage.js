/**
* @author       Richard Davey <rich@photonstorm.com>
* @copyright    2016 Photon Storm Ltd.
* @license      {@link https://github.com/photonstorm/phaser/blob/master/license.txt|MIT License}
*/

/**
* The Stage controls root level display objects upon which everything is displayed.
* It also handles browser visibility handling and the pausing due to loss of focus.
*
* @class Phaser.Stage
* @extends PIXI.DisplayObjectContainer
* @constructor
* @param {Phaser.Game} game - Game reference to the currently running game.
 */
Phaser.Stage = function (game)
{

    /**
    * @property {Phaser.Game} game - A reference to the currently running Game.
    */
    this.game = game;

    PIXI.DisplayObjectContainer.call(this);

    /**
    * @property {string} name - The name of this object.
    * @default
    */
    this.name = '_stage_root';

    /**
    * By default if the browser tab loses focus the game will pause.
    * You can stop that behavior by setting this property to true.
    * Note that the browser can still elect to pause your game if it wishes to do so,
    * for example swapping to another browser tab. This will cause the RAF callback to halt,
    * effectively pausing your game, even though no in-game pause event is triggered if you enable this property.
    * @property {boolean} disableVisibilityChange
    * @default
    */
    this.disableVisibilityChange = false;

    /**
    * @property {boolean} exists - If exists is true the Stage and all children are updated, otherwise it is skipped.
    * @default
    */
    this.exists = true;

    /**
    * @property {Phaser.Matrix} worldTransform - Current transform of the object based on world (parent) factors
    * @private
    * @readOnly
    */
    this.worldTransform = new Phaser.Matrix();

    /**
    * @property {Phaser.Stage} stage - The stage reference (the Stage is its own stage)
    * @private
    * @readOnly
    */
    this.stage = this;

    /**
    * @property {number} currentRenderOrderID - Reset each frame, keeps a count of the total number of objects updated.
    */
    this.currentRenderOrderID = 0;

    /**
    * @property {string} hiddenVar - The page visibility API event name.
    * @private
    */
    this._hiddenVar = 'hidden';

    /**
    * @property {function} _onChange - The blur/focus event handler.
    * @private
    */
    this._onChange = null;

    /**
    * @property {number} _bgColor - Stage background color object. Populated by setBackgroundColor.
    * @private
    */
    this._bgColor = { r: 0, g: 0, b: 0, a: 0, color: 0, rgba: '#000000' };

    if (!this.game.transparent)
    {
        //  transparent = 0,0,0,0 - otherwise r,g,b,1
        this._bgColor.a = 1;
    }

    if (game.config)
    {
        this.parseConfig(game.config);
    }

};

Phaser.Stage.prototype = Object.create(PIXI.DisplayObjectContainer.prototype);
Phaser.Stage.prototype.constructor = Phaser.Stage;

/**
* Parses a Game configuration object.
*
* @method Phaser.Stage#parseConfig
* @protected
* @param {object} config -The configuration object to parse.
*/
Phaser.Stage.prototype.parseConfig = function (config)
{

    if (config['disableVisibilityChange'])
    {
        this.disableVisibilityChange = config['disableVisibilityChange'];
    }

    if (config['backgroundColor'])
    {
        this.setBackgroundColor(config['backgroundColor']);
    }

};

/**
* Initialises the stage and adds the event listeners.
* @method Phaser.Stage#boot
* @private
*/
Phaser.Stage.prototype.boot = function ()
{

    Phaser.DOM.getOffset(this.game.canvas, this.offset);

    Phaser.Canvas.setUserSelect(this.game.canvas, 'none');
    Phaser.Canvas.setTouchAction(this.game.canvas, 'none');

    this.checkVisibility();

};

/**
* This is called automatically after the plugins preUpdate and before the State.update.
* Most objects have preUpdate methods and it's where initial movement and positioning is done.
*
* @method Phaser.Stage#preUpdate
*/
Phaser.Stage.prototype.preUpdate = function ()
{

    this.currentRenderOrderID = 0;

    //  This can't loop in reverse, we need the renderOrderID to be in sequence
    var i = 0;

    while (i < this.children.length)
    {
        var child = this.children[i];

        child.preUpdate();

        if (this === child.parent)
        {
            i++;
        }
    }

};

/**
* This is called automatically after the State.update, but before particles or plugins update.
*
* @method Phaser.Stage#update
*/
Phaser.Stage.prototype.update = function ()
{

    //  Goes in reverse, because it's highly likely the child will destroy itself in `update`
    var i = this.children.length;

    while (i--)
    {
        this.children[i].update();
    }

};

/**
* This is called automatically before the renderer runs and after the plugins have updated.
* In postUpdate this is where all the final physics calculations and object positioning happens.
* The objects are processed in the order of the display list.
*
* @method Phaser.Stage#postUpdate
*/
Phaser.Stage.prototype.postUpdate = function ()
{

    //  Apply the camera shake, fade, bounds, etc
    this.game.camera.update();

    //  Camera target first?
    if (this.game.camera.target)
    {
        this.game.camera.target.postUpdate();

        this.updateTransform();

        this.game.camera.updateTarget();
    }

    for (var i = 0; i < this.children.length; i++)
    {
        this.children[i].postUpdate();
    }

    this.updateTransform();

};

/**
* Updates the transforms for all objects on the display list.
* This overrides the Pixi default as we don't need the interactionManager, but do need the game property check.
*
* @method Phaser.Stage#updateTransform
*/
Phaser.Stage.prototype.updateTransform = function ()
{

    this.worldAlpha = 1;

    for (var i = 0; i < this.children.length; i++)
    {
        this.children[i].updateTransform();
    }

};

/**
* Starts a page visibility event listener running, or window.onpagehide/onpageshow if not supported by the browser.
* Also listens for window.onblur and window.onfocus.
*
* @method Phaser.Stage#checkVisibility
*/
Phaser.Stage.prototype.checkVisibility = function ()
{

    if (document.hidden !== undefined)
    {
        this._hiddenVar = 'visibilitychange';
    }
    else if (document.webkitHidden !== undefined)
    {
        this._hiddenVar = 'webkitvisibilitychange';
    }
    else if (document.mozHidden !== undefined)
    {
        this._hiddenVar = 'mozvisibilitychange';
    }
    else if (document.msHidden !== undefined)
    {
        this._hiddenVar = 'msvisibilitychange';
    }
    else
    {
        this._hiddenVar = null;
    }

    var _this = this;

    this._onChange = function (event)
    {
        return _this.visibilityChange(event);
    };

    this._onChangePause = function ()
    {
        return _this._onChange({ type: 'pause' });
    };

    this._onChangeResume = function ()
    {
        return _this._onChange({ type: 'resume' });
    };

    this._onClick = function (event)
    {
        if ((document.hasFocus !== undefined) && !document.hasFocus())
        {
            _this.visibilityChange(event);
        }
    };

    //  Does browser support it? If not (like in IE9 or old Android) we need to fall back to blur/focus
    if (this._hiddenVar)
    {
        document.addEventListener(this._hiddenVar, this._onChange, false);
    }

    window.onblur = this._onChange;
    window.onfocus = this._onChange;

    window.onpagehide = this._onChange;
    window.onpageshow = this._onChange;

    window.addEventListener('click', this._onClick);

    if (this.game.device.cocoonJSApp && CocoonJS.App)
    {
        if (CocoonJS.App.onSuspended)
        {
            CocoonJS.App.onSuspended.addEventListener(this._onChangePause);
        }

        if (CocoonJS.App.onActivated)
        {
            CocoonJS.App.onActivated.addEventListener(this._onChangeResume);
        }

        if (CocoonJS.App.on)
        {
            CocoonJS.App.on('activated', this._onChangeResume);
            CocoonJS.App.on('suspended', this._onChangePause);
        }
    }

};

/**
* This method is called when the document visibility is changed.
*
* - `blur` and `pagehide` events trigger {@link Phaser.Game#onBlur}. They {@link Phaser.Game#gamePaused pause the game} unless {@link #disableVisibilityChange} is on.
* - `click`, `focus`, and `pageshow` trigger {@link Phaser.Game#onFocus}. They {@link Phaser.Game#gameResumed resume the game} unless {@link #disableVisibilityChange} is on.
* - `visibilitychange` (hidden) and CocoonJS's `onSuspended` {@link Phaser.Game#gamePaused pause the game} unless {@link #disableVisibilityChange} is on.
* - `visibilitychange` (visible) and CocoonJS's `onActivated` {@link Phaser.Game#gameResumed resume the game} unless {@link #disableVisibilityChange} is on.
*
* @method Phaser.Stage#visibilityChange
* @param {Event} event - Its type will be used to decide whether the game should be paused or not.
*/
Phaser.Stage.prototype.visibilityChange = function (event)
{

    // These events always trigger the Game#onBlur or Game#onFocus signals.

    switch (event.type)
    {
        case 'blur':
        case 'pagehide':
            this.game.focusLoss(event);
            return;
        case 'click':
        case 'focus':
        case 'pageshow':
            this.game.focusGain(event);
            return;
    }

    if (this.disableVisibilityChange)
    {
        return;
    }

    if (document.hidden || document.mozHidden || document.msHidden || document.webkitHidden || event.type === 'pause')
    {
        this.game.gamePaused(event);
    }
    else
    {
        this.game.gameResumed(event);
    }

};

/**
* Sets the background color for the Stage.
*
* The color can be given as a hex string (`'#RRGGBB'`), a CSS color string (`'rgb(r,g,b)'`), or a numeric value (`0xRRGGBB`).
*
* An alpha channel is _not_ supported and will be ignored.
*
* If you've set your game to be {@link Phaser.Game#transparent transparent} then calls to setBackgroundColor are ignored.
*
* If {@link Phaser.Game#clearBeforeRender} is off then the background color won't appear.
*
* @method Phaser.Stage#setBackgroundColor
* @param {number|string} color - The color of the background.
*/
Phaser.Stage.prototype.setBackgroundColor = function (color)
{

    if (this.game.transparent) { return; }

    Phaser.Color.valueToColor(color, this._bgColor);
    Phaser.Color.updateColor(this._bgColor);

    //  For gl.clearColor (canvas uses _bgColor.rgba)
    this._bgColor.r /= 255;
    this._bgColor.g /= 255;
    this._bgColor.b /= 255;
    this._bgColor.a = 1;

};

/**
* Destroys the Stage and removes event listeners.
*
* @method Phaser.Stage#destroy
*/
Phaser.Stage.prototype.destroy = function ()
{

    if (this._hiddenVar)
    {
        document.removeEventListener(this._hiddenVar, this._onChange, false);
    }

    window.onpagehide = null;
    window.onpageshow = null;

    window.onblur = null;
    window.onfocus = null;

    window.removeEventListener('click', this._onClick);

};

/**
* Adds an existing object to the Stage.
*
* The child is automatically added to the front of the Stage, and is displayed above every previous child.
* Or if the _optional_ `index` is specified, the child is added at the location specified by the index value,
* this allows you to control child ordering.
*
* If the object was already on the Stage, it is simply returned, and nothing else happens to it.
*
* @method Phaser.Stage#add
* @param {DisplayObject} child - The display object to add as a child.
* @param {boolean} [silent] - Unused. Kept for compatibility with {@link Phaser.Group#add}.
* @param {integer} [index] - The index to insert the object to.
* @return {DisplayObject} The child that was added to the group.
*/
Phaser.Stage.prototype.add = function (child, silent, index)
{

    if (child.parent === this)
    {
        return child;
    }

    if (child.body && child.parent && child.parent.hash)
    {
        child.parent.removeFromHash(child);
    }

    if (index === undefined)
    {
        this.addChild(child);
    }
    else
    {
        this.addChildAt(child, index);
    }

    return child;

};

/**
* @name Phaser.Stage#backgroundColor
* @property {number|string} backgroundColor - Gets and sets the background color of the stage. The color can be given as a number: 0xff0000 or a hex string: '#ff0000'
* @see Phaser.Stage#setBackgroundColor
*/
Object.defineProperty(Phaser.Stage.prototype, 'backgroundColor', {

    get: function ()
    {

        return this._bgColor.color;

    },

    set: function (color)
    {

        this.setBackgroundColor(color);

    }

});

/**
* Enable or disable texture smoothing for all objects on this Stage. Only works for bitmap/image textures. Smoothing is enabled by default.
*
* @name Phaser.Stage#smoothed
* @property {boolean} smoothed - Set to true to smooth all sprites rendered on this Stage, or false to disable smoothing (great for pixel art)
*/
Object.defineProperty(Phaser.Stage.prototype, 'smoothed', {

    get: function ()
    {

        return PIXI.scaleModes.DEFAULT === PIXI.scaleModes.LINEAR;

    },

    set: function (value)
    {

        if (value)
        {
            PIXI.scaleModes.DEFAULT = PIXI.scaleModes.LINEAR;
        }
        else
        {
            PIXI.scaleModes.DEFAULT = PIXI.scaleModes.NEAREST;
        }
    }

});
