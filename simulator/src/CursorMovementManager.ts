import { createPopper, Instance as PopperInstance } from '@popperjs/core'
import { ComponentFactory } from './ComponentFactory'
import { ZIndexBackground, ZIndexNormal, ZIndexOverlay } from './ComponentList'
import { ComponentBase, ComponentState } from './components/Component'
import { ContextMenuItem, Drawable, DrawableWithPosition } from "./components/Drawable"
import { Node } from "./components/Node"
import { dist, setColorMouseOverIsDanger } from './drawutils'
import { applyModifiersTo, button, cls, li, Modifier, ModifierObject, mods, span, type, ul } from './htmlgen'
import { IconName, makeIcon } from './images'
import { LogicEditor, MouseAction } from './LogicEditor'
import { isDefined, isNotNull, isNull, isUndefined, Mode, TimeoutHandle } from "./utils"

type MouseDownData = {
    mainComp: Drawable | Element
    selectionComps: Drawable[]
    fireMouseClickedOnFinish: boolean
    initialXY: [number, number]
    triggeredContextMenu: boolean
}

export class EditorSelection {

    public previouslySelectedElements = new Set<Drawable>()

    constructor(
        public currentlyDrawnRect: DOMRect | undefined,
    ) { }

    public toggle(elem: Drawable) {
        if (this.previouslySelectedElements.has(elem)) {
            this.previouslySelectedElements.delete(elem)
        } else {
            this.previouslySelectedElements.add(elem)
        }
    }

    public finishCurrentRect(editor: LogicEditor) {
        let rect
        if (isDefined(rect = this.currentlyDrawnRect)) {
            for (const comp of editor.components.all()) {
                if (comp.isInRect(rect)) {
                    this.toggle(comp)
                }
            }

            for (const wire of editor.wireMgr.wires) {
                for (const point of wire.waypoints) {
                    if (point.isInRect(rect)) {
                        this.toggle(point)
                    }
                }
            }

            this.currentlyDrawnRect = undefined
        }
    }

    public isSelected(component: Drawable): boolean {
        const prevSelected = this.previouslySelectedElements.has(component)
        const rect = this.currentlyDrawnRect
        if (isUndefined(rect)) {
            return prevSelected
        } else {
            const inverted = component.isInRect(rect)
            return inverted ? !prevSelected : prevSelected
        }
    }

}


export class CursorMovementManager {

    public readonly editor: LogicEditor
    private _currentMouseOverComp: Drawable | null = null
    private _currentMouseOverPopper: PopperInstance | null = null
    private _currentMouseDownData: MouseDownData | null = null
    private _startHoverTimeoutHandle: TimeoutHandle | null = null
    private _startDragTimeoutHandle: TimeoutHandle | null = null
    private _currentHandlers: ToolHandlers
    private _lastTouchEnd: [Drawable, number] | undefined = undefined
    public currentSelection: EditorSelection | undefined = undefined

    constructor(editor: LogicEditor) {
        this.editor = editor
        this._currentHandlers = new EditHandlers(editor)
    }

    public get currentMouseOverComp() {
        return this._currentMouseOverComp
    }

    public get currentMouseDownData() {
        return this._currentMouseDownData
    }

    setHandlersFor(action: MouseAction) {
        this._currentHandlers = (() => {
            switch (action) {
                case "edit": return new EditHandlers(this.editor)
                case "delete": return new DeleteHandlers(this.editor)
                case "move": return new MoveHandlers(this.editor)
            }
        })()
        setColorMouseOverIsDanger(action === "delete")
    }

    setStartDragTimeout(startMouseDownData: MouseDownData, e: MouseEvent | TouchEvent) {
        // we do this because firefox otherwise sets back offsetX/Y to 0
        const _e = e as any
        _e._savedOffsetX = _e.offsetX
        _e._savedOffsetY = _e.offsetY
        _e._savedTarget = _e.target
        this._startDragTimeoutHandle = setTimeout(
            this.editor.wrapHandler(() => {
                let fireDrag = true
                const endMouseDownData = this._currentMouseDownData
                if (isNotNull(endMouseDownData)) {
                    endMouseDownData.fireMouseClickedOnFinish = false
                    if (endMouseDownData.triggeredContextMenu) {
                        fireDrag = false
                    }
                }
                if (fireDrag) {
                    if (startMouseDownData.mainComp instanceof Drawable) {
                        this._currentHandlers.mouseDraggedOn(startMouseDownData.mainComp, e)
                    }
                    for (const comp of startMouseDownData.selectionComps) {
                        this._currentHandlers.mouseDraggedOn(comp, e)
                    }
                }
            }),
            300
        )
    }

    clearStartDragTimeout() {
        if (isNotNull(this._startDragTimeoutHandle)) {
            clearTimeout(this._startDragTimeoutHandle)
            this._startDragTimeoutHandle = null
        }
    }

    clearHoverTimeoutHandle() {
        if (isNotNull(this._startHoverTimeoutHandle)) {
            clearTimeout(this._startHoverTimeoutHandle)
            this._startHoverTimeoutHandle = null
        }
    }

    setCurrentMouseOverComp(comp: Drawable | null) {
        if (comp !== this._currentMouseOverComp) {
            this.clearPopperIfNecessary()
            this.clearHoverTimeoutHandle()

            this._currentMouseOverComp = comp
            if (isNotNull(comp)) {
                this._startHoverTimeoutHandle = setTimeout(() => {
                    this._currentHandlers.mouseHoverOn(comp)
                    this._startHoverTimeoutHandle = null
                }, 1200)
            }
            this.editor.redrawMgr.addReason("mouseover changed", null)
            // console.log("Over component: ", comp)
        }
    }

    updateMouseOver([x, y]: [number, number]) {
        const findMouseOver: () => Drawable | null = () => {
            // easy optimization: maybe we're still over the
            // same component as before, so quickly check this
            if (isNotNull(this._currentMouseOverComp) && this._currentMouseOverComp.drawZIndex !== 0) {
                // second condition says: always revalidate the mouseover of background components (with z index 0)
                if (this._currentMouseOverComp.isOver(x, y)) {
                    return this._currentMouseOverComp
                }
            }

            // overlays
            for (const comp of this.editor.components.withZIndex(ZIndexOverlay)) {
                if (comp.isOver(x, y)) {
                    return comp
                }
            }

            // normal components or their nodes
            for (const comp of this.editor.components.withZIndex(ZIndexNormal)) {
                let nodeOver: Node | null = null
                comp.forEachNode((node) => {
                    if (node.isOver(x, y)) {
                        nodeOver = node
                        return false
                    }
                    return true
                })
                if (isNotNull(nodeOver)) {
                    return nodeOver
                }
                if (comp.isOver(x, y)) {
                    return comp
                }
            }

            // wires
            for (const wire of this.editor.wireMgr.wires) {
                for (const waypoint of wire.waypoints) {
                    if (waypoint.isOver(x, y)) {
                        return waypoint
                    }
                }
                if (wire.isOver(x, y)) {
                    return wire
                }
            }

            // background elems
            for (const comp of this.editor.components.withZIndex(ZIndexBackground)) {
                if (comp.isOver(x, y)) {
                    return comp
                }
            }

            return null
        }

        this.setCurrentMouseOverComp(findMouseOver())
    }

    selectAll() {
        const sel = new EditorSelection(undefined)
        this.currentSelection = sel
        for (const comp of this.editor.components.all()) {
            sel.previouslySelectedElements.add(comp)
        }
        for (const wire of this.editor.wireMgr.wires) {
            for (const waypoint of wire.waypoints) {
                sel.previouslySelectedElements.add(waypoint)
            }
        }
        this.editor.redrawMgr.addReason("selected all", null)
    }

    toggleSelect(comp: Drawable) {
        let sel
        if (isUndefined(sel = this.currentSelection)) {
            sel = new EditorSelection(undefined)
            this.currentSelection = sel
        } 
        sel.toggle(comp)
        this.editor.redrawMgr.addReason("toggled selection", null)
    }


    clearPopperIfNecessary() {
        if (isNotNull(this._currentMouseOverPopper)) {
            this._currentMouseOverPopper.destroy()
            this._currentMouseOverPopper = null
            this.editor.html.tooltipElem.style.display = "none"
        }
    }

    makePopper(tooltipHtml: ModifierObject, rect: DOMRect) {
        const tooltipContents = this.editor.html.tooltipContents
        const tooltipElem = this.editor.html.tooltipElem
        tooltipContents.innerHTML = ""
        tooltipHtml.applyTo(tooltipContents)
        tooltipElem.style.removeProperty("display")
        const canvas = document.getElementsByTagName("CANVAS")[0]
        this._currentMouseOverPopper = createPopper({
            getBoundingClientRect() { return rect },
            contextElement: canvas,
        }, tooltipElem, {
            placement: 'right',
            modifiers: [{ name: 'offset', options: { offset: [4, 8] } }],
        })
        tooltipElem.setAttribute('data-show', '')
        this._currentMouseOverPopper.update()
    }

    registerCanvasListenersOn(canvas: HTMLCanvasElement) {
        const editor = this.editor
        canvas.addEventListener("touchstart", editor.wrapHandler((e) => {
            // console.log("canvas touchstart %o %o, composedPath = %o", offsetXY(e), e, e.composedPath())
            if (this.editor.mode >= Mode.CONNECT) {
                // prevent scrolling when we can connect
                e.preventDefault()
            }
            this._mouseDownTouchStart(e)
        }))
        canvas.addEventListener("touchmove", editor.wrapHandler((e) => {
            // console.log("canvas touchmove %o %o, composedPath = %o", offsetXY(e), e, e.composedPath())
            if (this.editor.mode >= Mode.CONNECT) {
                // prevent scrolling when we can connect
                e.preventDefault()
            }
            this._mouseMoveTouchMove(e)
        }))

        canvas.addEventListener("touchend", editor.wrapHandler((e) => {
            // console.log("canvas touchend %o %o, composedPath = %o", offsetXY(e), e, e.composedPath())
            // touchend should always be prevented, otherwise it may
            // generate mouse/click events
            e.preventDefault()
            this._mouseUpTouchEnd(e)
            this.setCurrentMouseOverComp(null)
        }))

        // canvasContainer.addEventListener("touchcancel", wrapHandler((e) => {
        //     // console.log("canvas touchcancel %o %o, composedPath = %o", offsetXY(e), e, e.composedPath())
        // }))

        canvas.addEventListener("mousedown", editor.wrapHandler((e) => {
            // console.log("mousedown %o, composedPath = %o", e, e.composedPath())
            this._mouseDownTouchStart(e)
        }))

        canvas.addEventListener("mousemove", editor.wrapHandler((e) => {
            // console.log("mousemove %o, composedPath = %o", e, e.composedPath())
            this._mouseMoveTouchMove(e)
            this.editor.updateCursor()
        }))

        canvas.addEventListener("mouseup", editor.wrapHandler((e) => {
            // console.log("mouseup %o, composedPath = %o", e, e.composedPath())
            this._mouseUpTouchEnd(e)
            this.updateMouseOver([e.offsetX, e.offsetY])
            this.editor.updateCursor()
        }))

        canvas.addEventListener("contextmenu", editor.wrapHandler((e) => {
            // console.log("contextmenu %o, composedPath = %o", e, e.composedPath())
            e.preventDefault()
            if (this.editor.mode >= Mode.CONNECT && isNotNull(this._currentMouseOverComp)) {
                this._currentHandlers.contextMenuOn(this._currentMouseOverComp, e)
            }
        }))
    }

    private _mouseDownTouchStart(e: MouseEvent | TouchEvent) {
        this.clearHoverTimeoutHandle()
        this.clearPopperIfNecessary()
        if (isNull(this._currentMouseDownData)) {
            const xy = this.editor.offsetXY(e)
            this.updateMouseOver(xy)
            if (isNotNull(this._currentMouseOverComp)) {
                // mouse down on component
                const { lockMouseOver } = this._currentHandlers.mouseDownOn(this._currentMouseOverComp, e)
                if (lockMouseOver) {
                    const selectedComps = isUndefined(this.currentSelection) ? [] : [...this.currentSelection.previouslySelectedElements]
                    for (const comp of selectedComps) {
                        if (comp !== this._currentMouseOverComp) {
                            this._currentHandlers.mouseDownOn(comp, e)
                        }
                    }
                    const mouseDownData: MouseDownData = {
                        mainComp: this._currentMouseOverComp,
                        selectionComps: selectedComps,
                        fireMouseClickedOnFinish: true,
                        initialXY: xy,
                        triggeredContextMenu: false,
                    }
                    this._currentMouseDownData = mouseDownData
                    this.setStartDragTimeout(mouseDownData, e)
                }
                this.editor.redrawMgr.addReason("mousedown", null)
            } else {
                // mouse down on background
                this._currentMouseDownData = {
                    mainComp: this.editor.html.canvasContainer,
                    selectionComps: [], // ignore selection
                    fireMouseClickedOnFinish: true,
                    initialXY: xy,
                    triggeredContextMenu: false,
                }
                this._currentHandlers.mouseDownOnBackground(e)
            }
            this.editor.updateCursor()
        } else {
            // we got a mousedown while a component had programmatically
            // been determined as being mousedown'd; ignore
        }
    }

    private _mouseMoveTouchMove(e: MouseEvent | TouchEvent) {
        if (isNotNull(this._currentMouseDownData)) {
            if (this._currentMouseDownData.triggeredContextMenu) {
                // cancel it all
                this._currentMouseDownData = null
            } else {
                if (this._currentMouseDownData.mainComp instanceof Drawable) {
                    // check if the drag is too small to be taken into account now
                    // (e.g., touchmove is fired very quickly)
                    const d = dist(...this.editor.offsetXY(e), ...this._currentMouseDownData.initialXY)
                    // NaN is returned when no input point was specified and
                    // dragging should then happen regardless
                    if (isNaN(d) || d >= 5) {
                        // dragging component
                        this.clearStartDragTimeout()
                        this._currentMouseDownData.fireMouseClickedOnFinish = false
                        this._currentHandlers.mouseDraggedOn(this._currentMouseDownData.mainComp, e)
                        for (const comp of this._currentMouseDownData.selectionComps) {
                            if (comp !== this._currentMouseDownData.mainComp) {
                                this._currentHandlers.mouseDraggedOn(comp, e)
                            }
                        }
                    }
                } else {
                    // dragging background
                    this._currentHandlers.mouseDraggedOnBackground(e)
                }
            }
        } else {
            // moving mouse or dragging without a locked component 
            this.updateMouseOver(this.editor.offsetXY(e))
        }
    }

    private _mouseUpTouchEnd(e: MouseEvent | TouchEvent) {
        // our target is either the locked component that
        // was clicked or the latest mouse over component
        const mouseUpTarget = this._currentMouseDownData?.mainComp ?? this._currentMouseOverComp
        if (mouseUpTarget instanceof Drawable) {
            // mouseup on component
            if (isNotNull(this._startDragTimeoutHandle)) {
                clearTimeout(this._startDragTimeoutHandle)
                this._startDragTimeoutHandle = null
            }
            this._currentHandlers.mouseUpOn(mouseUpTarget, e)
            for (const comp of this._currentMouseDownData?.selectionComps ?? []) {
                if (comp !== mouseUpTarget) {
                    this._currentHandlers.mouseUpOn(comp, e)
                }
            }

            if (this._currentMouseDownData?.fireMouseClickedOnFinish ?? false) {
                if (this.isDoubleClick(mouseUpTarget, e)) {
                    const handled = this._currentHandlers.mouseDoubleClickedOn(mouseUpTarget, e)
                    if (!handled) {
                        // no double click handler, so we trigger a normal click
                        this._currentHandlers.mouseClickedOn(mouseUpTarget, e)
                    }
                } else {
                    this._currentHandlers.mouseClickedOn(mouseUpTarget, e)
                }
            }

        } else {
            // mouseup on background
            this._currentHandlers.mouseUpOnBackground(e)
        }
        this._currentMouseDownData = null
        this.editor.redrawMgr.addReason("mouseup", null)
    }

    private isDoubleClick(clickedComp: Drawable, e: MouseEvent | TouchEvent) {
        if ("offsetX" in e) {
            return e.detail === 2
        } else {
            const oldLastTouchEnd = this._lastTouchEnd
            const now = new Date().getTime()
            this._lastTouchEnd = [clickedComp, now]
            if (!isDefined(oldLastTouchEnd)) {
                return false
            }
            const [lastComp, lastTime] = oldLastTouchEnd
            const elapsedTimeMillis = now - lastTime
            const isDoubleTouch = lastComp === clickedComp && elapsedTimeMillis > 0 && elapsedTimeMillis < 300
            if (isDoubleTouch) {
                this._lastTouchEnd = undefined
            }
            return isDoubleTouch
        }
    }

    registerButtonListenersOn(componentButtons: NodeListOf<HTMLElement>) {
        const editor = this.editor
        for (let i = 0; i < componentButtons.length; i++) {
            const compButton = componentButtons[i]
            const factory = ComponentFactory.makeFactoryForButton(compButton)

            const buttonMouseDownTouchStart = (e: MouseEvent | TouchEvent) => {
                this.editor.setCurrentMouseAction("edit")
                e.preventDefault()
                this.editor.cursorMovementMgr.currentSelection = undefined
                const newComponent = factory(editor)
                this._currentMouseOverComp = newComponent
                const { lockMouseOver } = this._currentHandlers.mouseDownOn(newComponent, e)
                if (lockMouseOver) {
                    this._currentMouseDownData = {
                        mainComp: this._currentMouseOverComp,
                        selectionComps: [], // ignore selection when dragging new component
                        fireMouseClickedOnFinish: false,
                        initialXY: [NaN, NaN],
                        triggeredContextMenu: false,
                    }
                }
                this._currentHandlers.mouseDraggedOn(newComponent, e)
            }

            compButton.addEventListener("mousedown", editor.wrapHandler((e) => {
                buttonMouseDownTouchStart(e)
            }))
            compButton.addEventListener("touchstart", editor.wrapHandler((e) => {
                // console.log("button touchstart %o %o", offsetXY(e), e)
                buttonMouseDownTouchStart(e)
            }))
            compButton.addEventListener("touchmove", editor.wrapHandler((e) => {
                // console.log("button touchmove %o %o", offsetXY(e), e)
                e.preventDefault()
                this._mouseMoveTouchMove(e)
            }))
            compButton.addEventListener("touchend", editor.wrapHandler((e) => {
                // console.log("button touchend %o %o", offsetXY(e), e)
                e.preventDefault() // otherwise, may generate mouseclick, etc.
                this._mouseUpTouchEnd(e)
                this.setCurrentMouseOverComp(null)
            }))
        }
    }

}


abstract class ToolHandlers {

    public readonly editor: LogicEditor

    constructor(editor: LogicEditor) {
        this.editor = editor
    }

    mouseHoverOn(__comp: Drawable) {
        // empty
    }
    mouseDownOn(__comp: Drawable, __e: MouseEvent | TouchEvent) {
        return { lockMouseOver: true }
    }
    mouseDraggedOn(__comp: Drawable, __e: MouseEvent | TouchEvent) {
        // empty
    }
    mouseUpOn(__comp: Drawable, __e: MouseEvent | TouchEvent) {
        // empty
    }
    mouseClickedOn(__comp: Drawable, __e: MouseEvent | TouchEvent) {
        // empty
    }
    mouseDoubleClickedOn(__comp: Drawable, __e: MouseEvent | TouchEvent): boolean {
        return false // false means unhandled
    }
    contextMenuOn(__comp: Drawable, __e: MouseEvent | TouchEvent): boolean {
        return false // false means unhandled
    }
    mouseDownOnBackground(__e: MouseEvent | TouchEvent) {
        // empty
    }
    mouseDraggedOnBackground(__e: MouseEvent | TouchEvent) {
        // empty
    }
    mouseUpOnBackground(__e: MouseEvent | TouchEvent) {
        // empty
    }
}

class EditHandlers extends ToolHandlers {

    private _openedContextMenu: HTMLElement | null = null

    constructor(editor: LogicEditor) {
        super(editor)
    }

    override mouseHoverOn(comp: Drawable) {
        const editor = this.editor
        editor.cursorMovementMgr.clearPopperIfNecessary()
        if (editor.options.hideTooltips) {
            return
        }
        // maybe the component is now dead
        if (comp instanceof ComponentBase && comp.state === ComponentState.DEAD) {
            return
        }
        const tooltip = comp.makeTooltip()
        const containerRect = editor.html.canvasContainer.getBoundingClientRect()
        if (isDefined(tooltip)) {
            const [cx, cy, w, h] =
                comp instanceof DrawableWithPosition
                    ? [comp.posX, comp.posY, comp.width, comp.height]
                    : [editor.mouseX, editor.mouseY, 4, 4]
            const rect = new DOMRect(containerRect.x + cx - w / 2, containerRect.y + cy - h / 2, w, h)
            editor.cursorMovementMgr.makePopper(tooltip, rect)
        }
    }
    override mouseDownOn(comp: Drawable, e: MouseEvent | TouchEvent): { lockMouseOver: boolean } {
        return comp.mouseDown(e)
    }
    override mouseDraggedOn(comp: Drawable, e: MouseEvent | TouchEvent) {
        comp.mouseDragged(e)
    }
    override mouseUpOn(comp: Drawable, e: MouseEvent | TouchEvent) {
        comp.mouseUp(e)
        this.editor.wireMgr.tryCancelWire()
    }
    override mouseClickedOn(comp: Drawable, e: MouseEvent | TouchEvent) {
        // console.log("mouseClickedOn %o", comp)
        comp.mouseClicked(e)
    }
    override mouseDoubleClickedOn(comp: Drawable, e: MouseEvent | TouchEvent) {
        return comp.mouseDoubleClicked(e)
    }
    override contextMenuOn(comp: Drawable, e: MouseEvent | TouchEvent) {
        // console.log("contextMenuOn: %o", comp)
        
        const hideMenu = () => {
            if (this._openedContextMenu !== null) {
                this._openedContextMenu.classList.remove('show-menu')
                this._openedContextMenu.innerHTML = ""
                this._openedContextMenu = null
            }
        }

        hideMenu()

        const contextMenuData = comp.makeContextMenu()
        // console.log("asking for menu: %o got: %o", comp, contextMenuData)
        if (isDefined(contextMenuData)) {

            // console.log("setting triggered")
            const currentMouseDownData = this.editor.cursorMovementMgr.currentMouseDownData
            if (isNotNull(currentMouseDownData)) {
                currentMouseDownData.triggeredContextMenu = true
            }

            // console.log("building menu for %o", contextMenuData)

            const defToElem = (item: ContextMenuItem): HTMLElement => {
                function mkButton(spec: { icon?: IconName | undefined, caption: Modifier }, danger: boolean) {
                    return button(type("button"), cls(`menu-btn${(danger ? " danger" : "")}`),
                        isUndefined(spec.icon)
                            ? spec.caption
                            : mods(makeIcon(spec.icon), span(cls("menu-text"), spec.caption))
                    )
                }

                switch (item._tag) {
                    case 'sep':
                        return li(cls("menu-separator")).render()
                    case 'text':
                        return li(cls("menu-item-static"), item.caption).render()
                    case "item": {
                        const but = mkButton(item, item.danger ?? false).render()
                        but.addEventListener("click", this.editor.wrapHandler((itemEvent: MouseEvent | TouchEvent) => {
                            item.action(itemEvent, e)
                        }))
                        return li(cls("menu-item"), but).render()
                    }
                    case "submenu": {
                        return li(cls("menu-item submenu"),
                            mkButton(item, false),
                            ul(cls("menu"),
                                ...item.items.map(defToElem)
                            )
                        ).render()
                    }
                }
            }

            const items = contextMenuData.map(defToElem)

            const mainContextMenu = this.editor.html.mainContextMenu
            applyModifiersTo(mainContextMenu, items)
            const em = e as MouseEvent
            mainContextMenu.style.left = em.pageX + 'px'
            mainContextMenu.style.top = em.pageY + 'px'
            mainContextMenu.classList.add("show-menu")
            this._openedContextMenu = mainContextMenu

            const clickHandler = () => {
                hideMenu()
                document.removeEventListener("click", clickHandler)
            }

            setTimeout(() => {
                document.addEventListener("click", clickHandler, false)
            }, 200)

            return true // handled
        }
        return false // unhandled
    }


    override mouseDownOnBackground(e: MouseEvent | TouchEvent) {
        const editor = this.editor
        const cursorMovementMgr = editor.cursorMovementMgr
        const currentSelection = cursorMovementMgr.currentSelection
        if (isDefined(currentSelection)) {
            const allowSelection = editor.mode >= Mode.CONNECT
            if (e.shiftKey && allowSelection) {
                if (isDefined(currentSelection.currentlyDrawnRect)) {
                    console.log("unexpected defined current rect when about to begin a new one")
                }
                // augment selection
                const [left, top] = editor.offsetXY(e)
                const rect = new DOMRect(left, top, 1, 1)
                currentSelection.currentlyDrawnRect = rect
            } else {
                // clear selection
                cursorMovementMgr.currentSelection = undefined
            }
            editor.redrawMgr.addReason("selection rect changed", null)
        }
    }
    override mouseDraggedOnBackground(e: MouseEvent | TouchEvent) {
        // TODO smarter selection handling:
        // - if shift key is pressed, add to selection, also individual component
        // - shift-click or drag inverses selection state
        const editor = this.editor
        const allowSelection = editor.mode >= Mode.CONNECT
        if (allowSelection) {
            const cursorMovementMgr = editor.cursorMovementMgr
            const currentSelection = cursorMovementMgr.currentSelection
            const [x, y] = editor.offsetXY(e)
            if (isUndefined(currentSelection)) {
                const rect = new DOMRect(x, y, 1, 1)
                cursorMovementMgr.currentSelection = new EditorSelection(rect)
            } else {
                const rect = currentSelection.currentlyDrawnRect
                if (isUndefined(rect)) {
                    console.log("trying to update a selection rect that is not defined")
                } else {
                    rect.width = x - rect.x
                    rect.height = y - rect.y
                    editor.redrawMgr.addReason("selection rect changed", null)
                }
            }
        }
    }

    override mouseUpOnBackground(__e: MouseEvent | TouchEvent) {
        const editor = this.editor
        editor.wireMgr.tryCancelWire()

        const cursorMovementMgr = editor.cursorMovementMgr
        const currentSelection = cursorMovementMgr.currentSelection
        if (isDefined(currentSelection)) {
            currentSelection.finishCurrentRect(this.editor)
            editor.redrawMgr.addReason("selection rect changed", null)
        }
    }
}

class DeleteHandlers extends ToolHandlers {

    constructor(editor: LogicEditor) {
        super(editor)
    }

    override mouseClickedOn(comp: Drawable, __: MouseEvent) {
        this.editor.tryDeleteDrawable(comp)
    }
}

class MoveHandlers extends ToolHandlers {

    constructor(editor: LogicEditor) {
        super(editor)
    }

    override mouseDownOnBackground(e: MouseEvent) {
        for (const comp of this.editor.components.all()) {
            comp.mouseDown(e)
        }
        for (const wire of this.editor.wireMgr.wires) {
            for (const waypoint of wire.waypoints) {
                waypoint.mouseDown(e)
            }
        }
    }
    override mouseDraggedOnBackground(e: MouseEvent) {
        for (const comp of this.editor.components.all()) {
            comp.mouseDragged(e)
        }
        for (const wire of this.editor.wireMgr.wires) {
            for (const waypoint of wire.waypoints) {
                waypoint.mouseDragged(e)
            }
        }
    }
    override mouseUpOnBackground(e: MouseEvent) {
        for (const comp of this.editor.components.all()) {
            comp.mouseUp(e)
        }
        for (const wire of this.editor.wireMgr.wires) {
            for (const waypoint of wire.waypoints) {
                waypoint.mouseUp(e)
            }
        }
    }
}
