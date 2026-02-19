import streamlit as st


PREFIX = "slice"


def get_slice(slice_name):
    key = f"{PREFIX}.{slice_name}"
    if key not in st.session_state:
        st.session_state[key] = {}
    return st.session_state[key]


def get_value(slice_name, name, default=None):
    payload = get_slice(slice_name)
    return payload.get(name, default)


def set_value(slice_name, name, value):
    payload = get_slice(slice_name)
    payload[name] = value


def update_slice(slice_name, values):
    payload = get_slice(slice_name)
    payload.update(values)


def clear_slice(slice_name):
    key = f"{PREFIX}.{slice_name}"
    if key in st.session_state:
        del st.session_state[key]
