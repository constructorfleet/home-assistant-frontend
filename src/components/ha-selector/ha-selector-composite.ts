import {
  mdiClose,
  mdiDelete,
  mdiDragHorizontalVariant,
  mdiPencil,
} from "@mdi/js";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators";
import memoizeOne from "memoize-one";
import { ensureArray } from "../../common/array/ensure-array";
import { fireEvent } from "../../common/dom/fire_event";
import type { CompositeSelector } from "../../data/selector";
import { formatSelectorValue } from "../../data/selector/format_selector_value";
import { showFormDialog } from "../../dialogs/form/show-form-dialog";
import type { HomeAssistant } from "../../types";
import type { HaFormSchema } from "../ha-form/types";
import "../ha-input-helper-text";
import "../ha-md-list";
import "../ha-md-list-item";
import "../ha-sortable";

@customElement("ha-selector-composite")
export class HaCompositeSelector extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public selector!: CompositeSelector;

  @property() public value?: any;

  @property() public label?: string;

  @property() public helper?: string;

  @property() public placeholder?: string;

  @property({ type: Boolean }) public disabled = false;

  @property({ type: Boolean }) public required = true;

  @property({ attribute: false }) public localizeValue?: (
    key: string
  ) => string;

  private _computeLabel = (schema: HaFormSchema): string => {
    if (!this.selector.composite) {
      return schema.name;
    }
    const field = this.selector.composite.schema[schema.name];
    return field?.label || field?.name || schema.name;
  };

  private _computeHelper = (schema: HaFormSchema): string => {
    if (!this.selector.composite) {
      return "";
    }
    const field = this.selector.composite.schema[schema.name];
    return field?.description || "";
  };

  private _renderItem(item: any, index: number) {
    if (!this.selector.composite) {
      return nothing;
    }

    const firstFieldKey = Object.keys(this.selector.composite.schema)[0];
    const firstField = this.selector.composite.schema[firstFieldKey];
    const labelSelector = firstField.selector;

    const label = labelSelector
      ? formatSelectorValue(this.hass, item[firstFieldKey], labelSelector)
      : "";

    const multiple = this.selector.composite.multiple || false;
    return html`
      <ha-md-list-item class="item">
        ${multiple
          ? html`
              <ha-svg-icon
                class="handle"
                .path=${mdiDragHorizontalVariant}
                slot="start"
              ></ha-svg-icon>
            `
          : nothing}
        <div slot="headline" class="label">${label}</div>
        <ha-icon-button
          slot="end"
          .item=${item}
          .index=${index}
          .label=${this.hass.localize("ui.common.edit")}
          .path=${mdiPencil}
          @click=${this._editItem}
        ></ha-icon-button>
        <ha-icon-button
          slot="end"
          .index=${index}
          .label=${this.hass.localize("ui.common.delete")}
          .path=${multiple ? mdiDelete : mdiClose}
          @click=${this._deleteItem}
        ></ha-icon-button>
      </ha-md-list-item>
    `;
  }

  protected render() {
    if (!this.selector.composite) {
      return nothing;
    }

    if (this.selector.composite.multiple) {
      const items = ensureArray(this.value ?? []);
      return html`
        ${this.label ? html`<label>${this.label}</label>` : nothing}
        <div class="items-container">
          <ha-sortable
            handle-selector=".handle"
            draggable-selector=".item"
            @item-moved=${this._itemMoved}
          >
            <ha-md-list>
              ${items.map((item, index) => this._renderItem(item, index))}
            </ha-md-list>
          </ha-sortable>
          <ha-button appearance="filled" @click=${this._addItem}>
            ${this.hass.localize("ui.common.add")}
          </ha-button>
        </div>
      `;
    }

    return html`
      ${this.label ? html`<label>${this.label}</label>` : nothing}
      <div class="items-container">
        ${this.value
          ? html`<ha-md-list> ${this._renderItem(this.value, 0)} </ha-md-list>`
          : html`
              <ha-button appearance="filled" @click=${this._addItem}>
                ${this.hass.localize("ui.common.add")}
              </ha-button>
            `}
      </div>
    `;
  }

  private _schema = memoizeOne((selector: CompositeSelector) => {
    if (!selector.composite) {
      return [];
    }
    return Object.entries(selector.composite.schema).map(([key, field]) => ({
      name: key,
      selector: field.selector,
      required: field.required ?? false,
      default: field.default,
    }));
  });

  private _itemMoved(ev) {
    ev.stopPropagation();
    const newIndex = ev.detail.newIndex;
    const oldIndex = ev.detail.oldIndex;
    if (!this.selector.composite!.multiple) {
      return;
    }
    const newValue = ensureArray(this.value ?? []).concat();
    const item = newValue.splice(oldIndex, 1)[0];
    newValue.splice(newIndex, 0, item);
    fireEvent(this, "value-changed", { value: newValue });
  }

  private async _addItem(ev) {
    ev.stopPropagation();

    // Prepare initial data with defaults
    const initialData = {};
    if (this.selector.composite) {
      Object.entries(this.selector.composite.schema).forEach(([key, field]) => {
        if (field.default !== undefined) {
          initialData[key] = field.default;
        }
      });
    }

    const newItem = await showFormDialog(this, {
      title: this.hass.localize("ui.common.add"),
      schema: this._schema(this.selector),
      data: initialData,
      computeLabel: this._computeLabel,
      computeHelper: this._computeHelper,
      submitText: this.hass.localize("ui.common.add"),
    });

    if (newItem === null) {
      return;
    }

    if (!this.selector.composite!.multiple) {
      fireEvent(this, "value-changed", { value: newItem });
      return;
    }

    const newValue = ensureArray(this.value ?? []).concat();
    newValue.push(newItem);
    fireEvent(this, "value-changed", { value: newValue });
  }

  private async _editItem(ev) {
    ev.stopPropagation();
    const item = ev.currentTarget.item;
    const index = ev.currentTarget.index;

    const updatedItem = await showFormDialog(this, {
      title: this.hass.localize("ui.common.edit"),
      schema: this._schema(this.selector),
      data: item,
      computeLabel: this._computeLabel,
      computeHelper: this._computeHelper,
      submitText: this.hass.localize("ui.common.save"),
    });

    if (updatedItem === null) {
      return;
    }

    if (!this.selector.composite!.multiple) {
      fireEvent(this, "value-changed", { value: updatedItem });
      return;
    }

    const newValue = ensureArray(this.value ?? []).concat();
    newValue[index] = updatedItem;
    fireEvent(this, "value-changed", { value: newValue });
  }

  private _deleteItem(ev) {
    ev.stopPropagation();
    const index = ev.currentTarget.index;

    if (!this.selector.composite!.multiple) {
      fireEvent(this, "value-changed", { value: undefined });
      return;
    }

    const newValue = ensureArray(this.value ?? []).concat();
    newValue.splice(index, 1);
    fireEvent(this, "value-changed", { value: newValue });
  }

  static get styles() {
    return [
      css`
        ha-md-list {
          gap: var(--ha-space-2);
        }
        ha-md-list-item {
          border: 1px solid var(--divider-color);
          border-radius: var(--ha-border-radius-md);
          --ha-md-list-item-gap: 0;
          --md-list-item-top-space: 0;
          --md-list-item-bottom-space: 0;
          --md-list-item-leading-space: 12px;
          --md-list-item-trailing-space: 4px;
          --md-list-item-two-line-container-height: 48px;
          --md-list-item-one-line-container-height: 48px;
        }
        .handle {
          cursor: move;
          padding: 8px;
          margin-inline-start: -8px;
        }
        label {
          margin-bottom: 8px;
          display: block;
        }
        ha-md-list-item .label {
          text-overflow: ellipsis;
          overflow: hidden;
          white-space: nowrap;
        }
        .items-container {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-2);
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-selector-composite": HaCompositeSelector;
  }
}
