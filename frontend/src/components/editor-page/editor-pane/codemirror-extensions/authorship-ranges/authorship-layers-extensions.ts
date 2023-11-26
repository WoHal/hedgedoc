/*
 * SPDX-FileCopyrightText: 2022 The HedgeDoc developers (see AUTHORS file)
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import type { Range, Transaction } from '@codemirror/state'
import { StateEffect, StateField } from '@codemirror/state'
import type { DecorationSet } from '@codemirror/view'
import { Decoration, EditorView } from '@codemirror/view'
import { Logger } from '../../../../../utils/logger'

export interface AuthorshipUpdate {
  from: number
  to: number
  userId: string
}

type MarkDecoration = {
  attributes?: Record<string, string>
}

const logger = new Logger('AuthorshipLayersExtensions')

const createMark = (from: number, to: number, userId: string): Range<Decoration> => {
  logger.debug('createMark from', from, 'to', to, 'userId', userId)
  return Decoration.mark({
    class: 'authorship-highlight',
    attributes: {
      'data-user-id': userId
    }
  }).range(from, to)
}

/**
 * Used to provide a new set of {@link Authorship authorships} to a codemirror state.
 */
export const authorshipsUpdateEffect = StateEffect.define<AuthorshipUpdate>({
  map: (value, change) => ({ ...value, from: change.mapPos(value.from), to: change.mapPos(value.to) })
})

/**
 * Saves the currently visible {@link RemoteCursor remote cursors}
 * and saves new cursors if a transaction with an {@link remoteCursorUpdateEffect update effect} has been dispatched.
 */
export const authorshipsStateField = StateField.define<DecorationSet>({
  create(): DecorationSet {
    return Decoration.none
  },
  update(authorshipDecorations: DecorationSet, transaction: Transaction) {
    authorshipDecorations = authorshipDecorations.map(transaction.changes)
    const effects = transaction.effects.filter((effect) => effect.is<AuthorshipUpdate>(authorshipsUpdateEffect))
    if (effects.length === 0) {
      return authorshipDecorations
    }
    effects.forEach((effect: StateEffect<AuthorshipUpdate>) => {
      const addedDecorations: Range<Decoration>[] = []
      const effectUserId = effect.value.userId
      const effectFrom = effect.value.from
      const effectTo = effect.value.to
      logger.debug('eff_from', effectFrom, 'eff_to', effectTo, 'eff_user', effectUserId)
      logger.debug('#decorations', authorshipDecorations.size)
      authorshipDecorations = authorshipDecorations.update({
        filter: (decorationFrom: number, decorationTo: number, value) => {
          const decorationUserId = (value.spec as MarkDecoration).attributes?.['data-user-id'] ?? ''
          logger.debug('dec_from', decorationFrom, 'dec_to', decorationTo, 'dec_user', decorationUserId)
          if (decorationFrom === effectTo || decorationTo === effectFrom) {
            // If the new decoration is at the beginning or the end  of the found decoration we just add it
            logger.debug('At beginning or end')
            return true
          }
          // determine if inside another users text
          const inOwnText = decorationUserId === effectUserId && decorationUserId !== undefined
          if (inOwnText) {
            // merge with surrounding text happens automatically, we just need to keep the current decoration
            logger.debug('In own text')
            return true
          }
          if (decorationFrom === effectFrom || decorationTo === effectTo) {
            // decoration and effect are the same
            logger.debug('decoration and effect are the same')
            return true
          }
          // split other text appropriate
          logger.debug('In other text (splitting)')
          addedDecorations.push(
            createMark(decorationFrom, effectFrom, decorationUserId),
            createMark(effectFrom, effectTo, effectUserId),
            createMark(effectTo, decorationTo, decorationUserId)
          )
          return false
        },
        filterFrom: effectFrom,
        filterTo: effectTo
      })

      if (addedDecorations.length === 0) {
        // on an empty decoration set add the effect
        addedDecorations.push(createMark(effectFrom, effectTo, effectUserId))
      }

      authorshipDecorations = authorshipDecorations.update({
        add: addedDecorations
      })
    })
    return authorshipDecorations
  },
  provide: (decorationSet) => EditorView.decorations.from(decorationSet)
})
