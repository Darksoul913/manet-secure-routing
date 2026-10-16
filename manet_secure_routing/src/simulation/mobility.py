import numpy as np


def gauss_markov_step(state, dt, area, mean_speed, speed_std, direction_std, alpha, rng):
    """Advance every node by dt seconds with the Gauss-Markov model; nodes reflect off the area border."""
    k = np.sqrt(1 - alpha ** 2)
    n = state.n
    state.speed = np.maximum(alpha * state.speed + (1 - alpha) * mean_speed + k * rng.normal(0, speed_std, n), 0)
    state.direction = alpha * state.direction + (1 - alpha) * state.mean_direction + k * rng.normal(0, direction_std, n)
    state.pos = state.pos + dt * state.speed[:, None] * np.c_[np.cos(state.direction), np.sin(state.direction)]

    for axis in (0, 1):
        low, high = state.pos[:, axis] < 0, state.pos[:, axis] > area
        hit = low | high
        state.pos[low, axis] *= -1
        state.pos[high, axis] = 2 * area - state.pos[high, axis]
        # Mirror the heading (x-wall: theta -> pi - theta, y-wall: theta -> -theta).
        flip = (lambda t: np.pi - t) if axis == 0 else (lambda t: -t)
        state.direction[hit] = flip(state.direction[hit])
        state.mean_direction[hit] = flip(state.mean_direction[hit])
    return state
