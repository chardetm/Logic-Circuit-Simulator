import { DrawableWithPosition } from "./components/Drawable"
import { Waypoint } from "./components/Wire"
import { LogicEditor } from "./LogicEditor"

export class MoveManager {

    public readonly editor: LogicEditor
    private _movingDrawables = new Set<DrawableWithPosition>()

    constructor(editor: LogicEditor) {
        this.editor = editor
    }

    private changeMovingDrawables(change: () => void) {
        const emptyBefore = this._movingDrawables.size === 0
        change()
        const emptyAfter = this._movingDrawables.size === 0
        if (emptyBefore !== emptyAfter) {
            this.editor.updateCursor()
            this.editor.redrawMgr.addReason("started or stopped moving drawables", null)
        }
    }

    public areDrawablesMoving() {
        return this._movingDrawables.size > 0
    }

    public getSingleMovingWaypoint(): Waypoint | undefined {
        if (this._movingDrawables.size === 1) {
            const drawable = this._movingDrawables.values().next().value
            if (drawable instanceof Waypoint) {
                return drawable
            }
        }
        return undefined
    }

    setDrawableMoving(comp: DrawableWithPosition) {
        this.changeMovingDrawables(() => {
            this._movingDrawables.add(comp)
        })
    }
    setDrawableStoppedMoving(comp: DrawableWithPosition) {
        this.changeMovingDrawables(() => {
            this._movingDrawables.delete(comp)
        })
    }

}
