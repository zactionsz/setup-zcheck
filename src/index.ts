import { runAction } from './action'
import { setFailed } from './github'

runAction().catch(setFailed)
