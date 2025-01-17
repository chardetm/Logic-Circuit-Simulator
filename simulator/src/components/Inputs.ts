import * as t from "io-ts"
import { LogicEditor } from "../LogicEditor"
import { isString, isUndefined } from "../utils"
import { Clock, ClockDef } from "./Clock"
import { InputBit, InputBitDef } from "./InputBit"
import { InputByte, InputByteDef } from "./InputByte"
import { InputNibble, InputNibbleDef } from "./InputNibble"
import { InputRandom, InputRandomDef } from "./InputRandom"

export type Input = InputBit | Clock | InputNibble

export const InputDef = t.union([
    InputBitDef.repr,
    ClockDef.repr,
    InputNibbleDef.repr,
    InputByteDef.repr,
    InputRandomDef.repr,
], "Input")

type InputRepr = t.TypeOf<typeof InputDef>

export const InputFactory = {

    make: (editor: LogicEditor, savedDataOrType: InputRepr | string | undefined) => {
        let blank
        let savedData: InputRepr

        if (isUndefined(savedDataOrType)) {
            // default, typeless option
            blank = true
            savedData = {} as InputRepr
        } else if (isString(savedDataOrType)) {
            // specific subtype
            blank = true
            savedData = { type: savedDataOrType } as InputRepr
        } else {
            // as saved
            blank = false
            savedData = savedDataOrType
        }

        if (!("type" in savedData)) {
            return new InputBit(editor, blank ? null : savedData)
        }
        switch (savedData.type) {
            case "clock":
                return new Clock(editor, blank ? null : savedData)
            case "nibble":
                return new InputNibble(editor, blank ? null : savedData)
            case "byte":
                return new InputByte(editor, blank ? null : savedData)
            case "random":
                return new InputRandom(editor, blank ? null : savedData)
        }
    },

}

